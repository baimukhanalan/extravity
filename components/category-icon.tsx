import {
  Rocket, Code2, Medal, Globe2, MessagesSquare, Bot, FlaskConical, Microscope,
  GraduationCap, Zap, Sun, Plane, HeartHandshake, Users, Trophy, Palette,
  Briefcase, UserCheck, Presentation, TrendingUp, Sparkles, type LucideIcon,
  PenLine, Mic2, Drama, Camera, Swords, Dumbbell, PersonStanding,
  BookOpenCheck,
} from "lucide-react";

const map: Record<string, LucideIcon> = {
  Rocket, Code2, Medal, Globe2, MessagesSquare, Bot, FlaskConical, Microscope,
  GraduationCap, Zap, Sun, Plane, HeartHandshake, Users, Trophy, Palette,
  Briefcase, UserCheck, Presentation, TrendingUp, Sparkles,
  PenLine, Mic2, Drama, Camera, Swords, Dumbbell, PersonStanding,
  BookOpenCheck,
};

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = map[name] ?? Sparkles;
  return <Icon className={className} />;
}
