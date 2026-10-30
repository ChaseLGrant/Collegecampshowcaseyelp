import { resolveCampLogo, type LogoSubject } from "@/lib/logos";
import { OrgLogoView } from "./OrgLogoView";

/**
 * Organizer/school logo next to a camp title. Resolves on the server (pure lookup) and hands the
 * client view only the resolved src/label/initials, so camp objects are never serialized.
 */
export function OrgLogo({ camp, size = "sm", className = "" }: { camp: LogoSubject; size?: "sm" | "lg"; className?: string }) {
  const { name, institutionName, organizerName, registrationUrl, sourceUrl } = camp;
  const logo = resolveCampLogo({ name, institutionName, organizerName, registrationUrl, sourceUrl });
  return <OrgLogoView logo={logo} size={size} className={className} />;
}
