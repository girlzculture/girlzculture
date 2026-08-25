import { readFileSync, writeFileSync } from "node:fs";

const path = "src/components/owner/OwnerDashboardApp.tsx";
let source = readFileSync(path, "utf8");

function replaceOnce(before, after) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Missing expected source: ${before.slice(0, 120)}`);
  if (source.indexOf(before, index + before.length) >= 0)
    throw new Error(`Expected exactly one source match: ${before.slice(0, 120)}`);
  source = source.slice(0, index) + after + source.slice(index + before.length);
}
function replaceRange(startToken, endToken, replacement) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  if (start < 0 || end < 0 || end <= start)
    throw new Error(`Unable to find range: ${startToken} -> ${endToken}`);
  source = source.slice(0, start) + replacement + source.slice(end);
}

replaceOnce(
  `import {\n  OwnerDetailHeader,\n  OwnerSectionCard,\n} from "@/components/owner/OwnerWorkflowUi";`,
  `import {\n  OwnerDetailHeader,\n  OwnerSectionCard,\n} from "@/components/owner/OwnerWorkflowUi";\nimport BookingCheckInExceptionForm, {\n  type CheckInExceptionAnswer,\n  type CheckInExceptionRequirement,\n} from "@/components/owner/BookingCheckInExceptionForm";`,
);

replaceOnce(
  `  const [confirmCompletion, setConfirmCompletion] = useState(false);`,
  `  const [confirmCompletion, setConfirmCompletion] = useState(false);\n  const [checkInException, setCheckInException] =\n    useState<CheckInExceptionRequirement | null>(null);`,
);

replaceRange(
  `  async function serviceAction(\n    action: "check_in" | "start" | "complete",\n  ) {`,
  `  async function cancelBooking() {`,
  `  async function serviceAction(\n    action: "check_in" | "start" | "complete",\n    exception?: CheckInExceptionAnswer,\n  ) {\n    if (!selected?.id) return;\n    setBusy(true);\n    try {\n      const session = await getSessionForScope("salon");\n      if (!session) throw new Error("Please sign in again.");\n      const response = await fetch(\n        \`/api/salon/bookings/\${selected.id}/service\`,\n        {\n          method: "POST",\n          headers: {\n            "Content-Type": "application/json",\n            Authorization: \`Bearer \${session.access_token}\`,\n          },\n          body: JSON.stringify({\n            action,\n            confirmed: action === "complete" ? confirmCompletion : undefined,\n            reason_code: exception?.reason_code,\n            reason_detail: exception?.reason_detail,\n            attested: exception?.attested,\n          }),\n        },\n      );\n      const body = (await response.json()) as {\n        error?: string;\n        code?: string;\n        booking?: Row;\n        requires_exception?: boolean;\n        exception_kind?: "early" | "late";\n        scheduled_at?: string;\n        attempted_at?: string;\n        offset_minutes?: number;\n        standard_window?: { opens_at: string; closes_at: string };\n        reasons?: Array<{ value: string; label: string }>;\n      };\n      if (response.status === 428 && body.requires_exception) {\n        if (\n          !body.exception_kind ||\n          !body.scheduled_at ||\n          !body.attempted_at ||\n          !body.standard_window ||\n          !Array.isArray(body.reasons)\n        ) {\n          throw new Error("The check-in reason workflow could not be loaded.");\n        }\n        setCheckInException({\n          exception_kind: body.exception_kind,\n          scheduled_at: body.scheduled_at,\n          attempted_at: body.attempted_at,\n          offset_minutes: Number(body.offset_minutes || 0),\n          standard_window: body.standard_window,\n          reasons: body.reasons,\n        });\n        c.setNotice(body.error || "Choose the reason for this check-in.");\n        return;\n      }\n      if (!response.ok || !body.booking) {\n        throw new Error(\n          body.error || "The service status could not be updated.",\n        );\n      }\n      c.setBookings((rows) =>\n        rows.map((booking) =>\n          booking.id === selected.id ? (body.booking as Row) : booking,\n        ),\n      );\n      setCheckInException(null);\n      setConfirmCompletion(false);\n      c.setNotice(\n        action === "check_in"\n          ? "Customer checked in. The appointment is ready to begin."\n          : action === "start"\n            ? "Service start recorded for on-time performance."\n            : "Service completed. Verified review eligibility is now enabled.",\n      );\n    } catch (error) {\n      c.setNotice(\n        error instanceof Error\n          ? error.message\n          : "The service status could not be updated.",\n      );\n    } finally {\n      setBusy(false);\n    }\n  }\n`,
);

replaceRange(
  `                    {String(selected.status).toLowerCase() === "confirmed" ? (`,
  `                    {String(selected.status).toLowerCase() === "ready" ? (`,
  `                    {String(selected.status).toLowerCase() === "confirmed" ? (\n                      <>\n                        {!checkInException ? (\n                          <button\n                            disabled={busy}\n                            onClick={() => void serviceAction("check_in")}\n                            className="mt-3 min-h-11 w-full rounded-[8px] bg-plum text-xs font-bold text-white disabled:opacity-50"\n                          >\n                            Check in customer\n                          </button>\n                        ) : null}\n                        {checkInException ? (\n                          <BookingCheckInExceptionForm\n                            requirement={checkInException}\n                            timeZone={String(\n                              c.salon.time_zone || "America/New_York",\n                            )}\n                            busy={busy}\n                            onCancel={() => setCheckInException(null)}\n                            onSubmit={(answer) =>\n                              serviceAction("check_in", answer)\n                            }\n                          />\n                        ) : null}\n                      </>\n                    ) : null}\n`,
);

writeFileSync(path, source);
console.log("Booking check-in exception UI wired into the owner dashboard.");
