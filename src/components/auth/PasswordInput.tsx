"use client";

import { forwardRef, useId, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

type PasswordInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  inputClassName?: string;
  buttonClassName?: string;
};

/**
 * Accessible password entry shared by every account surface. The visibility
 * state is local to this field so revealing one password never reveals another
 * confirmation field on the page.
 */
const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput(
    { inputClassName = "", buttonClassName = "", id, ...inputProps },
    ref,
  ) {
    const generatedId = useId();
    const inputId = id || generatedId;
    const [visible, setVisible] = useState(false);

    return (
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <input
          {...inputProps}
          ref={ref}
          id={inputId}
          type={visible ? "text" : "password"}
          className={`min-w-0 flex-1 ${inputClassName}`}
        />
        <button
          type="button"
          aria-controls={inputId}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          title={visible ? "Hide password" : "Show password"}
          onClick={() => setVisible((current) => !current)}
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-md text-ink/65 outline-none transition hover:bg-blush/50 focus-visible:ring-2 focus-visible:ring-magenta focus-visible:ring-offset-2 ${buttonClassName}`}
        >
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </span>
    );
  },
);

export default PasswordInput;
