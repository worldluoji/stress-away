import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Eye,
  EyeOff,
  FileText,
  FolderOpen,
  Heart,
  Home,
  Inbox,
  Lightbulb,
  Loader2,
  Lock,
  MessageCircle,
  MoreHorizontal,
  RefreshCw,
  Search,
  Send,
  Share2,
  Sparkles,
  Star,
  TrendingUp,
  User,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

const ICONS = {
  "alert-circle": AlertCircle,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  bookmark: Bookmark,
  "bookmark-check": BookmarkCheck,
  check: Check,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  clock: Clock,
  copy: Copy,
  eye: Eye,
  "eye-off": EyeOff,
  "file-text": FileText,
  "folder-open": FolderOpen,
  heart: Heart,
  home: Home,
  inbox: Inbox,
  lightbulb: Lightbulb,
  loader: Loader2,
  lock: Lock,
  "message-circle": MessageCircle,
  more: MoreHorizontal,
  refresh: RefreshCw,
  search: Search,
  send: Send,
  share: Share2,
  sparkles: Sparkles,
  star: Star,
  "trending-up": TrendingUp,
  user: User,
  x: X,
  "x-circle": XCircle,
  zap: Zap,
} as const satisfies Record<string, ComponentType<SVGProps<SVGSVGElement>>>;

export type IconName = keyof typeof ICONS;

interface Props {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  filled?: boolean;
}

export function Icon({ name, size = 16, strokeWidth = 1.8, className, filled }: Props) {
  const Component = ICONS[name];
  return (
    <Component
      width={size}
      height={size}
      strokeWidth={strokeWidth}
      fill={filled ? "currentColor" : "none"}
      className={className}
      aria-hidden="true"
    />
  );
}
