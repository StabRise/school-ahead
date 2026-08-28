/*
 * sonicare-library.ts
 *
 * Lightweight Philips Sonicare Web Bluetooth library.
 *
 * Currently decoded:
 *
 * 4010:
 *   01 = OFF / NOT BRUSHING
 *   02 = BRUSHING
 *   03 = CHARGING
 *
 * Battery:
 *   Standard BLE Battery Service 0x180F
 *   Battery Level characteristic 0x2A19
 *
 * Designed for React:
 *
 *   const unsubscribe = sonicare.subscribe((state) => {
 *     ...
 *   });
 *
 * Browser support:
 *   Web Bluetooth is required.
 *
 * Important:
 *   connect() must normally be called from a user gesture
 *   such as a button click.
 */

/* -------------------------------------------------------------------------- */
/* Web Bluetooth types                                                        */
/* -------------------------------------------------------------------------- */

declare global {
  interface Navigator {
    bluetooth: Bluetooth;
  }

  interface Bluetooth {
    requestDevice(
      options: RequestDeviceOptions
    ): Promise<BluetoothDevice>;

    getDevices?(): Promise<BluetoothDevice[]>;
  }

  interface RequestDeviceOptions {
    acceptAllDevices?: boolean;
    filters?: BluetoothLEScanFilter[];
    optionalServices?: BluetoothServiceUUID[];
  }

  interface BluetoothLEScanFilter {
    services?: BluetoothServiceUUID[];
    name?: string;
    namePrefix?: string;
  }

  type BluetoothServiceUUID = string | number;

  interface BluetoothDevice extends EventTarget {
    readonly id: string;
    readonly name?: string;
    readonly gatt?: BluetoothRemoteGATTServer;
  }

  interface BluetoothRemoteGATTServer {
    readonly connected: boolean;

    connect(): Promise<BluetoothRemoteGATTServer>;

    disconnect(): void;

    getPrimaryService(
      service: BluetoothServiceUUID
    ): Promise<BluetoothRemoteGATTService>;
  }

  interface BluetoothRemoteGATTService {
    readonly uuid: string;

    getCharacteristic(
      characteristic: BluetoothServiceUUID
    ): Promise<BluetoothRemoteGATTCharacteristic>;
  }

  interface BluetoothRemoteGATTCharacteristic
    extends EventTarget {
    readonly uuid: string;
    readonly properties: BluetoothCharacteristicProperties;
    readonly value?: DataView;

    readValue(): Promise<DataView>;

    startNotifications(): Promise<
      BluetoothRemoteGATTCharacteristic
    >;

    stopNotifications(): Promise<
      BluetoothRemoteGATTCharacteristic
    >;
  }

  interface BluetoothCharacteristicProperties {
    broadcast: boolean;
    read: boolean;
    writeWithoutResponse: boolean;
    write: boolean;
    notify: boolean;
    indicate: boolean;
    authenticatedSignedWrites: boolean;
    reliableWrite: boolean;
    writableAuxiliaries: boolean;
  }
}

/* -------------------------------------------------------------------------- */
/* Public types                                                               */
/* -------------------------------------------------------------------------- */

export type SonicareState =
  | "off"
  | "brushing"
  | "charging"
  | "unknown";

export type SonicareStatus = {
  /**
   * Current decoded brush state.
   */
  state: SonicareState;

  /**
   * Battery percentage, 0-100.
   */
  chargeLevel: number | undefined;

  /**
   * Whether GATT is currently connected.
   */
  isConnected: boolean;

  /**
   * Bluetooth device name.
   */
  name: string;

  /**
   * Optional model reported by the device.
   */
  model?: string;
};

/* -------------------------------------------------------------------------- */
/* UUIDs                                                                      */
/* -------------------------------------------------------------------------- */

const UUID = {
  batteryService:
    "0000180f-0000-1000-8000-00805f9b34fb",

  batteryLevel:
    "00002a19-0000-1000-8000-00805f9b34fb",

  deviceInformation:
    "0000180a-0000-1000-8000-00805f9b34fb",

  model:
    "00002a24-0000-1000-8000-00805f9b34fb",

  sonicare:
    "477ea600-a260-11e4-ae37-0002a5d50001",

  state4010:
    "477ea600-a260-11e4-ae37-0002a5d54010",
} as const;

/* -------------------------------------------------------------------------- */
/* Library                                                                    */
/* -------------------------------------------------------------------------- */

class SonicareLibrary {
  private device: BluetoothDevice | null = null;

  private stateCharacteristic:
    | BluetoothRemoteGATTCharacteristic
    | null = null;

  private batteryCharacteristic:
    | BluetoothRemoteGATTCharacteristic
    | null = null;

  private status: SonicareStatus = {
    state: "unknown",
    chargeLevel: undefined,
    isConnected: false,
    name: "",
  };

  private listeners = new Set<
    (status: SonicareStatus) => void
  >();

  /* ------------------------------------------------------------------------ */
  /* Public getters                                                           */
  /* ------------------------------------------------------------------------ */

  /**
   * Current decoded brush state.
   */
  get state(): SonicareState {
    return this.status.state;
  }

  /**
   * Current battery percentage.
   */
  get chargeLevel(): number | undefined {
    return this.status.chargeLevel;
  }

  /**
   * Current Bluetooth connection state.
   */
  get isConnected(): boolean {
    return this.status.isConnected;
  }

  /**
   * Full current status.
   */
  getStatus(): SonicareStatus {
    return this.status;
  }

  /* ------------------------------------------------------------------------ */
  /* React subscription                                                       */
  /* ------------------------------------------------------------------------ */

  /**
   * Subscribe to every state/connection/battery change.
   *
   * Returns an unsubscribe function.
   */
  subscribe(
    listener: (status: SonicareStatus) => void
  ): () => void {
    this.listeners.add(listener);

    // Immediately give the subscriber current state.
    listener(this.status);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.status);
    }
  }

  private update(
    patch: Partial<SonicareStatus>
  ): void {
    this.status = {
      ...this.status,
      ...patch,
    };

    this.emit();
  }

  /* ------------------------------------------------------------------------ */
  /* Connect                                                                  */
  /* ------------------------------------------------------------------------ */

  /**
   * Opens the browser Bluetooth device chooser.
   *
   * Call this from a button click:
   *
   *   await sonicare.connect();
   */
  async connect(): Promise<SonicareStatus> {
    if (
      typeof navigator === "undefined" ||
      !("bluetooth" in navigator)
    ) {
      throw new Error(
        "Web Bluetooth is not supported by this browser."
      );
    }

    if (this.device) {
      await this.disconnect();
    }

    /*
     * We intentionally use acceptAllDevices.
     *
     * Sonicare models can advertise under different names,
     * e.g. HX6340 / Sonicare / Sonicare4Kids.
     *
     * The actual device is validated by its proprietary
     * Sonicare service after connection.
     */
    const device =
      await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,

        optionalServices: [
          UUID.batteryService,
          UUID.deviceInformation,
          UUID.sonicare,
        ],
      });

    await this.attach(device);

    return this.status;
  }

  /* ------------------------------------------------------------------------ */
  /* Attach                                                                   */
  /* ------------------------------------------------------------------------ */

  private async attach(
    device: BluetoothDevice
  ): Promise<void> {
    this.device = device;

    device.addEventListener(
      "gattserverdisconnected",
      this.handleDisconnect
    );

    if (!device.gatt) {
      throw new Error(
        "Selected Bluetooth device does not support GATT."
      );
    }

    const server =
      await device.gatt.connect();

    this.update({
      isConnected: true,

      name:
        device.name ||
        "Philips Sonicare",
    });

    /*
     * Verify that this is actually a Sonicare device.
     */
    try {
      await server.getPrimaryService(
        UUID.sonicare
      );
    } catch {
      await this.disconnect();

      throw new Error(
        "The selected Bluetooth device does not expose the Philips Sonicare service."
      );
    }

    /*
     * Battery and state are independent.
     */
    await this.setupBattery();

    await this.setupState();

    /*
     * Model is optional. Failure does not prevent
     * the brush from working.
     */
    await this.readModel();

    console.log(
      "🪥 Sonicare connected:",
      this.status.name
    );
  }

  /* ------------------------------------------------------------------------ */
  /* State / 4010                                                              */
  /* ------------------------------------------------------------------------ */

  private async setupState(): Promise<void> {
    if (!this.device?.gatt?.connected) {
      return;
    }

    try {
      const service =
        await this.device.gatt.getPrimaryService(
          UUID.sonicare
        );

      const characteristic =
        await service.getCharacteristic(
          UUID.state4010
        );

      this.stateCharacteristic =
        characteristic;

      /*
       * Read the current state immediately.
       */
      if (characteristic.properties.read) {
        const value =
          await characteristic.readValue();

        this.handleStateValue(value);
      }

      /*
       * Subscribe if the brush supports notifications.
       */
      if (
        characteristic.properties.notify ||
        characteristic.properties.indicate
      ) {
        characteristic.removeEventListener(
          "characteristicvaluechanged",
          this.handleStateNotification
        );

        characteristic.addEventListener(
          "characteristicvaluechanged",
          this.handleStateNotification
        );

        await characteristic.startNotifications();
      }
    } catch (error) {
      console.warn(
        "Unable to read Sonicare 4010 state:",
        error
      );

      this.update({
        state: "unknown",
      });
    }
  }

  private handleStateNotification = (
    event: Event
  ): void => {
    const characteristic =
      event.target as
        | BluetoothRemoteGATTCharacteristic
        | null;

    if (!characteristic?.value) {
      return;
    }

    this.handleStateValue(
      characteristic.value
    );
  };

  /**
   * Decode proprietary 4010.
   *
   * Observed HX6340:
   *
   * 01 = OFF / NOT BRUSHING
   * 02 = BRUSHING
   * 03 = CHARGING
   */
  private handleStateValue(
    value: DataView
  ): void {
    if (value.byteLength < 1) {
      return;
    }

    const raw =
      value.getUint8(0);

    let state: SonicareState;

    switch (raw) {
      case 0x01:
        state = "off";
        break;

      case 0x02:
        state = "brushing";
        break;

      case 0x03:
        state = "charging";
        break;

      default:
        state = "unknown";
        break;
    }

    /*
     * This update is deliberately emitted even when the
     * state changes from:
     *
     * charging -> off
     * charging -> brushing
     * brushing -> off
     *
     * React therefore sees charging stop immediately.
     */
    this.update({
      state,
    });

    console.log(
      `🪥 Sonicare 4010 = 0x${raw
        .toString(16)
        .padStart(2, "0")} → ${state}`
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Battery                                                                  */
  /* ------------------------------------------------------------------------ */

  private async setupBattery(): Promise<void> {
    if (!this.device?.gatt?.connected) {
      return;
    }

    try {
      const service =
        await this.device.gatt.getPrimaryService(
          UUID.batteryService
        );

      const characteristic =
        await service.getCharacteristic(
          UUID.batteryLevel
        );

      this.batteryCharacteristic =
        characteristic;

      /*
       * Initial battery read.
       */
      if (characteristic.properties.read) {
        const value =
          await characteristic.readValue();

        this.handleBatteryValue(value);
      }

      /*
       * Battery can update while connected.
       */
      if (
        characteristic.properties.notify ||
        characteristic.properties.indicate
      ) {
        characteristic.removeEventListener(
          "characteristicvaluechanged",
          this.handleBatteryNotification
        );

        characteristic.addEventListener(
          "characteristicvaluechanged",
          this.handleBatteryNotification
        );

        await characteristic.startNotifications();
      }
    } catch (error) {
      /*
       * Battery service is optional. Some Sonicare models
       * may not expose it.
       */
      console.warn(
        "Sonicare battery service unavailable:",
        error
      );
    }
  }

  private handleBatteryNotification = (
    event: Event
  ): void => {
    const characteristic =
      event.target as
        | BluetoothRemoteGATTCharacteristic
        | null;

    if (!characteristic?.value) {
      return;
    }

    this.handleBatteryValue(
      characteristic.value
    );
  };

  private handleBatteryValue(
    value: DataView
  ): void {
    if (value.byteLength < 1) {
      return;
    }

    const level =
      Math.max(
        0,
        Math.min(
          100,
          value.getUint8(0)
        )
      );

    this.update({
      chargeLevel: level,
    });

    console.log(
      `🔋 Sonicare battery: ${level}%`
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Model                                                                     */
  /* ------------------------------------------------------------------------ */

  private async readModel(): Promise<void> {
    if (!this.device?.gatt?.connected) {
      return;
    }

    try {
      const service =
        await this.device.gatt.getPrimaryService(
          UUID.deviceInformation
        );

      const characteristic =
        await service.getCharacteristic(
          UUID.model
        );

      if (!characteristic.properties.read) {
        return;
      }

      const value =
        await characteristic.readValue();

      const model =
        new TextDecoder()
          .decode(value)
          .replace(/\0/g, "")
          .trim();

      if (model) {
        this.update({
          model,
        });
      }
    } catch {
      /*
       * Model information is optional.
       */
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Disconnect                                                               */
  /* ------------------------------------------------------------------------ */

  /**
   * Disconnect the current Sonicare.
   */
  async disconnect(): Promise<void> {
    const device =
      this.device;

    this.device = null;

    /*
     * Stop notifications.
     */
    try {
      if (this.stateCharacteristic) {
        this.stateCharacteristic.removeEventListener(
          "characteristicvaluechanged",
          this.handleStateNotification
        );

        if (
          this.stateCharacteristic.properties
            .notify ||
          this.stateCharacteristic.properties
            .indicate
        ) {
          await this.stateCharacteristic
            .stopNotifications()
            .catch(() => undefined);
        }
      }
    } catch {
      // Ignore cleanup errors.
    }

    try {
      if (this.batteryCharacteristic) {
        this.batteryCharacteristic.removeEventListener(
          "characteristicvaluechanged",
          this.handleBatteryNotification
        );

        if (
          this.batteryCharacteristic.properties
            .notify ||
          this.batteryCharacteristic.properties
            .indicate
        ) {
          await this.batteryCharacteristic
            .stopNotifications()
            .catch(() => undefined);
        }
      }
    } catch {
      // Ignore cleanup errors.
    }

    this.stateCharacteristic =
      null;

    this.batteryCharacteristic =
      null;

    if (device) {
      device.removeEventListener(
        "gattserverdisconnected",
        this.handleDisconnect
      );

      if (device.gatt?.connected) {
        device.gatt.disconnect();
      }
    }

    /*
     * Reset public state.
     */
    this.update({
      state: "unknown",
      isConnected: false,
      chargeLevel: undefined,
      name: "",
      model: undefined,
    });
  }

  /* ------------------------------------------------------------------------ */
  /* Unexpected Bluetooth disconnect                                          */
  /* ------------------------------------------------------------------------ */

  private handleDisconnect = (): void => {
    this.device = null;

    this.stateCharacteristic =
      null;

    this.batteryCharacteristic =
      null;

    /*
     * Do NOT leave React thinking the brush is still
     * charging/brushing after Bluetooth disconnects.
     */
    this.update({
      state: "unknown",
      isConnected: false,
      chargeLevel: undefined,
      name: "",
      model: undefined,
    });

    console.log(
      "🪥 Sonicare disconnected"
    );
  };
}

/* -------------------------------------------------------------------------- */
/* Singleton                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Import this singleton throughout your app:
 *
 * import sonicare from "./sonicare-library";
 */
const sonicare =
  new SonicareLibrary();

export default sonicare;

export { SonicareLibrary };