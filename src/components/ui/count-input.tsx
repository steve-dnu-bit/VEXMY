import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

/** Number input that allows clearing with backspace before committing on blur. */
export function CountInput({
  value,
  onChange,
  min = 0,
  className,
  id,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  className?: string;
  id?: string;
}) {
  const [raw, setRaw] = useState(String(value));

  useEffect(() => {
    setRaw(String(value));
  }, [value]);

  return (
    <Input
      id={id}
      type="number"
      min={min}
      value={raw}
      onChange={(e) => {
        const next = e.target.value;
        setRaw(next);
        if (next === "") return;
        const n = parseInt(next, 10);
        if (Number.isFinite(n)) onChange(Math.max(min, n));
      }}
      onBlur={() => {
        const n = raw === "" ? min : Math.max(min, parseInt(raw, 10) || min);
        onChange(n);
        setRaw(String(n));
      }}
      className={className}
    />
  );
}
