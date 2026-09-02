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
    layerOrder: item.layer_order ?? 0,
    price: item.price ?? 0,
    isUnlocked: item.is_unlocked ?? true,
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
    translationScope: (user.translation_scope as AuthUser["translationScope"]) ?? null,
    translateOnSelect: user.translate_on_select ?? null,
    diamondBalance: user.diamond_balance ?? null,
    equippedAvatar: user.equipped_avatar ? mapAvatar(user.equipped_avatar) : null,
    equippedClothingItems: (user.equipped_clothing_items ?? []).map(mapAvatarItem),
    equippedHeadwearItems: (user.equipped_headwear_items ?? []).map(mapAvatarItem),
    equippedAccessoryItems: (user.equipped_accessory_items ?? []).map(mapAvatarItem),
  };
}
