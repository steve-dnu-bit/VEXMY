import { Capacitor } from "@capacitor/core";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type TimeInputProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  step?: number;
};

function minuteOptions(stepSeconds: number) {
  const stepMinutes = Math.max(1, Math.round(stepSeconds / 60));
  const options: string[] = [];
  for (let m = 0; m < 60; m += stepMinutes) {
    options.push(String(m).padStart(2, "0"));
  }
  return options;
}

function parseTime(value: string) {
  const [hour = "09", minute = "00"] = value.split(":");
  return {
    hour: hour.padStart(2, "0"),
    minute: minute.padStart(2, "0"),
  };
}

/** Native Android WebView `<input type="time">` has broken colon/selection chrome — use dropdowns instead. */
export function TimeInput({ value, onChange, className, step = 900 }: TimeInputProps) {
  const useMobilePicker = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  const { hour, minute } = parseTime(value);
  const minutes = minuteOptions(step);
  const normalizedMinute = minutes.includes(minute) ? minute : minutes[0] ?? "00";

  if (!useMobilePicker) {
    return (
      <Input
        type="time"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
      />
    );
  }

  const setHour = (nextHour: string) => onChange(`${nextHour}:${normalizedMinute}`);
  const setMinute = (nextMinute: string) => onChange(`${hour}:${nextMinute}`);

  return (
    <div className={cn("grid grid-cols-[1fr_auto_1fr] items-center gap-1", className)}>
      <Select value={hour} onValueChange={setHour}>
        <SelectTrigger className="field-surface border-border h-10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map((h) => (
            <SelectItem key={h} value={h}>
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="px-0.5 text-sm text-muted-foreground select-none">:</span>
      <Select value={normalizedMinute} onValueChange={setMinute}>
        <SelectTrigger className="field-surface border-border h-10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {minutes.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
