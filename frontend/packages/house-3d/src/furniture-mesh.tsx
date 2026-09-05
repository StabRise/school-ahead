"use client";

import { useEffect, useRef, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { TransformControls } from "@react-three/drei";
import * as THREE from "three";
import { FurnitureModel } from "./furniture-model";
import type { MtlTexture } from "./lib/mtl-resource-map";
import type { FurnitureSurface, HorizontalFootprint } from "./lib/surface";
import { snapToSurface } from "./lib/surface";
import type { GizmoMode } from "./stores/house-scene-store";

const POINT_FOOTPRINT: HorizontalFootprint = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };

export interface FurnitureMeshProps {
  modelUrl: string;
  modelFormat: "obj" | "stl";
  materialUrl: string | null;
  textures: MtlTexture[];
  surface: FurnitureSurface;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  isSelected: boolean;
  // Whether the room is interactive at all (house-scene-store's
  // isEditorMode) — outside Editor Mode, this item ignores clicks entirely.
  isEditorMode: boolean;
  gizmoMode: GizmoMode;
  // The house/ page's "show move/rotate arrows" setting (house-scene-store's
  // showGizmoArrows). Only gates the TransformControls gizmo's own visuals
  // and its rotate ring — dragging the object directly to move it (see
  // handlePointerDown/Move/Up below) always works in Editor Mode regardless
  // of this, since there's no gizmo-free way to rotate but there is one to
  // translate.
  showGizmoArrows: boolean;
  onSelect: () => void;
  onTransformEnd: (position: [number, number, number], rotation: [number, number, number], scale: number) => void;
  // Room-scene.tsx disables OrbitControls for the duration of a direct
  // drag (see below) — both this item's own pointer-drag and
  // TransformControls' gizmo drag report through this, so the camera never
  // fights the student for the same pointer.
  onDraggingChange?: (dragging: boolean) => void;
}

// One placed FurnitureItem in the 3D scene — see PlacedFurnitureItem on the
// backend. In Editor Mode, clicking it selects it, and dragging it directly
// (press, drag, release — no gizmo required) moves it within its catalog
// `surface` (see lib/surface.ts): floor/ceiling items stay flat (only x/z
// move), wall items can be dragged freely and snap flush against the
// nearest wall on release. Rotating still needs the TransformControls ring,
// shown only when showGizmoArrows is on — there's no direct-drag gesture
// for spinning an object the way there is for moving one.
//
// Rendered as two nested groups, not one: the *outer* group carries
// position and the facing/spin rotation (rotation.y only — what dragging
// and TransformControls' rotate handle touch), and the *inner* group
// carries the tutor's fixed tilt (rotation.x/z, from default_rotation —
// e.g. standing a window up that was authored lying flat). Keeping those on
// separate Object3D nodes, rather than merging into one rotation triple,
// is what makes wall-facing and tilt compose correctly — see
// lib/surface.ts's snapToSurface docstring for why a single triple can't.
export function FurnitureMesh({
  modelUrl,
  modelFormat,
  materialUrl,
  textures,
  surface,
  position,
  rotation,
  scale,
  isSelected,
  isEditorMode,
  gizmoMode,
  showGizmoArrows,
  onSelect,
  onTransformEnd,
  onDraggingChange,
}: FurnitureMeshProps) {
  // The outer group — TransformControls attaches here, and its own
  // rotation only ever holds [0, facingY, 0]; tilt lives one level down
  // and this node never touches it. Held in state (set via the `group` ref
  // callback below), not a React ref read during render — TransformControls
  // needs the actual Object3D instance to attach to, which only exists once
  // this component has mounted.
  const [outerGroup, setOuterGroup] = useState<THREE.Group | null>(null);

  // Floor/ceiling items are flush against a flat, axis-known plane: their
  // gizmo hides the handle that would pull them off it (Y-translate), and
  // their direct-drag plane below is locked horizontal so y can't move at
  // all while dragging. Wall items can face any of four different planes
  // depending on where they're currently stuck, so their translate stays
  // unrestricted and gets corrected by the snap on release instead. Rotate
  // never shows X/Z for any surface — tilt is a fixed tutor/catalog
  // property here, not something a student drags — only the Y
  // (facing/spin) ring is ever interactive.
  const isFlatSurface = surface === "floor" || surface === "ceiling";

  // Direct-drag bookkeeping — a plane through the point where the student
  // grabbed the object (horizontal for floor/ceiling, camera-facing for
  // walls — see handlePointerDown), and the offset from that point to the
  // object's own origin, so the object doesn't "jump" to be centered under
  // the cursor the instant the drag starts.
  const dragPlane = useRef(new THREE.Plane());
  const dragOffset = useRef(new THREE.Vector3());
  const isDragging = useRef(false);
  const dragMoved = useRef(false);

  // The inner (tilt) group's own Object3D, so we can measure the item's
  // actual mesh extent — see the footprint effect below. Unlike outerGroup,
  // this never needs to be an attach target, so a plain ref is enough.
  const contentGroup = useRef<THREE.Group>(null);

  // How far this item's mesh reaches from its pivot on the horizontal
  // plane at its current tilt + facing (see lib/surface.ts's
  // HorizontalFootprint) — starts as a point (no margin) until the model
  // has loaded and this gets measured for real, which reproduces the old
  // pivot-only clamping in the brief window before that happens.
  //
  // Deliberately NOT recomputed straight out of commitTransform (right
  // after a drag/rotate ends): this component briefly re-renders with the
  // *pre-drag* position/rotation props whenever any state here changes —
  // the parent hasn't re-rendered with the freshly PATCHed placement yet —
  // and recomputing `snapped` from those stale props would snap the item
  // straight back to where it started right after the student let go of
  // it. Instead this only re-measures when `position`/`rotation` themselves
  // change (mount, or the parent catching up post-PATCH with a value that
  // already matches what's on screen), which is always safe to act on.
  const [footprint, setFootprint] = useState<HorizontalFootprint>(POINT_FOOTPRINT);

  useEffect(() => {
    if (!outerGroup || !contentGroup.current) return;
    outerGroup.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(contentGroup.current);
    if (box.isEmpty()) return;
    const pivot = outerGroup.position;
    setFootprint({
      minX: box.min.x - pivot.x,
      maxX: box.max.x - pivot.x,
      minZ: box.min.z - pivot.z,
      maxZ: box.max.z - pivot.z,
    });
  }, [outerGroup, modelUrl, scale, position, rotation]);

  // Recomputed on every render (not just after a drag) so a stored
  // placement — or a brand-new item still at its catalog default of
  // (0,0,0) — always renders stuck to its surface.
  const snapped = snapToSurface(surface, position, rotation, footprint);

  // Reads whatever's currently on the live outer group (position, plus
  // rotation.y — the only axis anything ever touches there) and persists a
  // freshly re-snapped version of it. Shared by both the direct-drag
  // pointer-up below and TransformControls' onMouseUp (for rotate).
  const commitTransform = () => {
    if (!outerGroup) return;
    const resnapped = snapToSurface(
      surface,
      [outerGroup.position.x, outerGroup.position.y, outerGroup.position.z],
      [rotation[0], outerGroup.rotation.y, rotation[2]],
      footprint,
    );
    // Applied back onto the live object immediately, so the mesh visibly
    // snaps into place the instant the student releases it, rather than
    // waiting on the PATCH round-trip and cache invalidation.
    outerGroup.position.set(...resnapped.position);
    outerGroup.rotation.set(0, resnapped.facingY, 0);
    onTransformEnd(resnapped.position, [resnapped.tiltX, resnapped.facingY, resnapped.tiltZ], outerGroup.scale.x);
  };

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (!isEditorMode || !outerGroup) return;
    event.stopPropagation();
    onSelect();

    const target = event.nativeEvent.target;
    if (target instanceof Element) target.setPointerCapture?.(event.pointerId);

    // Floor/ceiling items drag across a strictly horizontal plane at their
    // current height, so vertical mouse movement can't nudge their y offset
    // (house.models.FurnitureItem.default_position_y) even a little — y
    // stays exactly what it was for the whole drag, not just clamped
    // afterwards. Wall items instead drag across a plane facing the
    // camera, through the object's current position, since they need to
    // move freely across all three axes to reach a different wall or a
    // different height — whatever they're dragged to gets corrected onto
    // the actual surface (nearest wall, height bounds, ...) both live (in
    // handlePointerMove) and again on release.
    if (isFlatSurface) {
      dragPlane.current.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), outerGroup.position);
    } else {
      const cameraDirection = new THREE.Vector3();
      event.camera.getWorldDirection(cameraDirection);
      dragPlane.current.setFromNormalAndCoplanarPoint(cameraDirection, outerGroup.position);
    }

    const hit = new THREE.Vector3();
    if (event.ray.intersectPlane(dragPlane.current, hit)) {
      dragOffset.current.copy(outerGroup.position).sub(hit);
    } else {
      dragOffset.current.set(0, 0, 0);
    }

    isDragging.current = true;
    dragMoved.current = false;
    onDraggingChange?.(true);
  };

  // Shared by the normal release (onPointerUp) and the "something ended the
  // drag without us ever getting a pointerup for it" case
  // (onLostPointerCapture — the browser revokes capture without a matching
  // pointerup e.g. when a context menu opens mid-drag, or the OS/browser
  // otherwise steals the pointer). Without also handling that event, a drag
  // whose capture was yanked away like this leaves isDragging stuck `true`
  // forever, and every later bare mouse *hover* (no button held) over the
  // canvas would keep calling handlePointerMove and dragging the item along
  // with the cursor — which is exactly what "moves without pressing the
  // mouse button" looks like.
  const endDrag = (event: ThreeEvent<PointerEvent>) => {
    if (!isDragging.current) return;
    event.stopPropagation();
    const target = event.nativeEvent.target;
    if (target instanceof Element) target.releasePointerCapture?.(event.pointerId);
    isDragging.current = false;
    onDraggingChange?.(false);
    // A plain click (select, no movement) shouldn't fire an unnecessary
    // PATCH — only persist when the object actually moved.
    if (dragMoved.current) commitTransform();
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!isDragging.current || !outerGroup) return;
    // Defensive: if the primary button somehow isn't held anymore (see
    // endDrag above for how that can happen without us ever hearing about
    // it), stop dragging instead of having the item keep following a bare
    // mouse hover with no button pressed.
    if (event.buttons === 0) {
      endDrag(event);
      return;
    }
    event.stopPropagation();
    const hit = new THREE.Vector3();
    if (!event.ray.intersectPlane(dragPlane.current, hit)) return;
    const dragged = hit.add(dragOffset.current);
    // Re-snapped on every move (not just on release) so the item's on-screen
    // position always honors its surface constraints while being dragged,
    // instead of visibly "popping" into place only after letting go.
    const live = snapToSurface(
      surface,
      [dragged.x, dragged.y, dragged.z],
      [rotation[0], outerGroup.rotation.y, rotation[2]],
      footprint,
    );
    outerGroup.position.set(...live.position);
    dragMoved.current = true;
  };

  return (
    <>
      <group
        ref={setOuterGroup}
        position={snapped.position}
        rotation={[0, snapped.facingY, 0]}
        scale={scale}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onLostPointerCapture={endDrag}
      >
        <group ref={contentGroup} rotation={[snapped.tiltX, 0, snapped.tiltZ]}>
          <FurnitureModel modelUrl={modelUrl} modelFormat={modelFormat} materialUrl={materialUrl} textures={textures} />
        </group>
      </group>
      {isEditorMode && isSelected && outerGroup && showGizmoArrows && (
        <TransformControls
          object={outerGroup}
          mode={gizmoMode}
          onMouseDown={() => onDraggingChange?.(true)}
          onMouseUp={() => {
            onDraggingChange?.(false);
            commitTransform();
          }}
          showY={!(isFlatSurface && gizmoMode === "translate")}
          showX={gizmoMode !== "rotate"}
          showZ={gizmoMode !== "rotate"}
        />
      )}
    </>
  );
}
