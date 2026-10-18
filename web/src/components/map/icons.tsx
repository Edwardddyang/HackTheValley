import {
  FileText, Flame, GraduationCap, HardHat, Hospital, House, Library, type LucideIcon, Pill, School, ShoppingBasket, Siren,
  Snowflake, TrainFront, Trees, Users, Waves,
} from "lucide-react";

import type { MapLocation } from "./mapData";

// Map icons (Lucide, one stroke style throughout). Each stands for one kind of place and always sits beside a text
// label somewhere (popup, legend, nearest rows); markers whose number is the information keep the number instead
// (RentSafeTO scores, 311 counts).

/** Icons for the kinds of place within the essentials, recreation, public-services and schools layers. */
export const CATEGORY_ICON: Record<NonNullable<MapLocation["category"]>, LucideIcon> = {
  subway: TrainFront,
  grocery: ShoppingBasket,
  pharmacy: Pill,
  hospital: Hospital,
  park: Trees,
  community: Users,
  pool: Waves,
  rink: Snowflake,
  library: Library,
  fire: Flame,
  police: Siren,
  school_public: School,
  school_catholic: School,
  school_french: School,
  school_private: School,
  postsecondary: GraduationCap,
};

/** Icons for layers whose markers are all one kind of thing. */
export const LAYER_ICON: Partial<Record<MapLocation["layer"], LucideIcon>> = {
  building: House,
  building_permit: HardHat,
  development_application: FileText,
};

/** The icon a marker shows, or null when it shows its label (a RentSafeTO score). */
export function iconFor(location: Pick<MapLocation, "layer" | "category">): LucideIcon | null {
  return (location.category && CATEGORY_ICON[location.category]) || LAYER_ICON[location.layer] || null;
}
