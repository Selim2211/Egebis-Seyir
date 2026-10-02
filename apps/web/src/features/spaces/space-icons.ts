import type { SpaceIcon } from '@scrum/shared';
import {
  BookOpen,
  Briefcase,
  ChartColumn,
  Code,
  Globe,
  Megaphone,
  Palette,
  Rocket,
  Shield,
  Smartphone,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export const SPACE_ICON_COMPONENTS: Record<SpaceIcon, LucideIcon> = {
  rocket: Rocket,
  code: Code,
  smartphone: Smartphone,
  globe: Globe,
  briefcase: Briefcase,
  megaphone: Megaphone,
  palette: Palette,
  wrench: Wrench,
  chart: ChartColumn,
  users: Users,
  shield: Shield,
  book: BookOpen,
};
