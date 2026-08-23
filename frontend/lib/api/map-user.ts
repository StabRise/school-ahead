import type { UserOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import type { AuthUser } from "@/stores/auth-store";

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
    equippedAvatar: user.equipped_avatar
      ? {
          id: user.equipped_avatar.id,
          key: user.equipped_avatar.key,
          name: user.equipped_avatar.name,
          image: user.equipped_avatar.image,
        }
      : null,
  };
}
