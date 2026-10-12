import { Icon, type IconName } from "./Icon";

type Role = "assistant" | "user";

const ROLE_CONFIG: Record<
  Role,
  { gradient: string; icon: IconName }
> = {
  assistant: {
    gradient: "from-[var(--color-brand)] to-[var(--color-brand-alt)]",
    icon: "lightbulb",
  },
  user: {
    gradient: "from-[var(--color-success)] to-[#30D158]",
    icon: "user",
  },
};

interface Props {
  role: Role;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES = {
  sm: "w-6 h-6",
  md: "w-8 h-8",
  lg: "w-12 h-12",
};

const ICON_SIZE = {
  sm: 12,
  md: 16,
  lg: 22,
};

export function Avatar({ role, size = "md", className }: Props) {
  const { gradient, icon } = ROLE_CONFIG[role];
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-white shadow-sm shrink-0 ${SIZE_CLASSES[size]} ${className ?? ""}`}
    >
      <Icon name={icon} size={ICON_SIZE[size]} strokeWidth={2} />
    </span>
  );
}
