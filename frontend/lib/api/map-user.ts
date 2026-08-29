import type {
  AvatarItemOut,
  AvatarOut,
  UserOut,
} from "@/lib/api/browser/schoolAheadAPI.schemas";
import type { AuthUser, EquippedAvatarItem } from "@/stores/auth-store";

function mapAvatarItem(item: AvatarItemOut): EquippedAvatarItem {
  return {
    id: item.id,
    slot: item.slot as EquippedAvatarItem["slot"],
    key: item.key,
    name: item.name,
    image: item.image,
    scale: item.scale ?? 1,
    offsetX: item.offset_x ?? 0,
    offsetY: item.offset_y ?? 0,
  };
}

function mapAvatar(avatar: AvatarOut) {
  return {
    id: avatar.id,
    key: avatar.key,
    name: avatar.name,
    image: avatar.image,
    scale: avatar.scale ?? 1,
    items: (avatar.items ?? []).map(mapAvatarItem),
  };
}

export function mapApiUserToAuthUser(user: UserOut): AuthUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role as AuthUser["role"],
    name: `${user.first_name} ${user.last_name}`.trim(),
    locale: user.locale,
    avatarUrl: user.avatar_url,
    interfaceMode: (user.interface_mode as AuthUser["interfaceMode"]) ?? null,
    diamondBalance: user.diamond_balance ?? null,
    equippedAvatar: user.equipped_avatar ? mapAvatar(user.equipped_avatar) : null,
    equippedClothing: user.equipped_clothing ? mapAvatarItem(user.equipped_clothing) : null,
    equippedHeadwear: user.equipped_headwear ? mapAvatarItem(user.equipped_headwear) : null,
    equippedAccessory: user.equipped_accessory ? mapAvatarItem(user.equipped_accessory) : null,
  };
}
