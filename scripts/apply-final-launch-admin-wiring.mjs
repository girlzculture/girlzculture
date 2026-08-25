import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(path, before, after) {
  const source = readFileSync(path, "utf8");
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Missing expected source in ${path}: ${before.slice(0, 100)}`);
  if (source.indexOf(before, index + before.length) >= 0)
    throw new Error(`Expected one source match in ${path}: ${before.slice(0, 100)}`);
  writeFileSync(path, source.slice(0, index) + after + source.slice(index + before.length));
}

function replaceRange(path, startToken, endToken, replacement) {
  const source = readFileSync(path, "utf8");
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  if (start < 0 || end < 0 || end <= start)
    throw new Error(`Unable to find replacement range in ${path}`);
  writeFileSync(path, source.slice(0, start) + replacement + source.slice(end));
}

replaceOnce(
  "src/components/owner/OwnerDashboardShell.tsx",
  `  useEffect(() => {\n    void refreshActionableBookingCount();\n    const refresh = () => void refreshActionableBookingCount();\n    window.addEventListener("gc:owner-booking-update", refresh);\n    return () =>\n      window.removeEventListener("gc:owner-booking-update", refresh);\n  }, [refreshActionableBookingCount]);`,
  `  useEffect(() => {\n    const initialRefresh = window.setTimeout(\n      () => void refreshActionableBookingCount(),\n      0,\n    );\n    const refresh = () => void refreshActionableBookingCount();\n    window.addEventListener("gc:owner-booking-update", refresh);\n    return () => {\n      window.clearTimeout(initialRefresh);\n      window.removeEventListener("gc:owner-booking-update", refresh);\n    };\n  }, [refreshActionableBookingCount]);`,
);

replaceOnce(
  "src/components/admin/AdminRecordWorkspace.tsx",
  `import AdminTimeZonePreference from "@/components/admin/AdminTimeZonePreference";`,
  `import AdminTimeZonePreference from "@/components/admin/AdminTimeZonePreference";\nimport AdminUserActivityTimeline from "@/components/admin/AdminUserActivityTimeline";`,
);

replaceRange(
  "src/components/admin/AdminRecordWorkspace.tsx",
  "function AdminMemberDetail(",
  "function ManualBooking(",
  `function AdminMemberDetail({ member }: { member?: Row; data: AdminRecordData }) {\n  if (!member) return <Missing label="Administrator"/>;\n  const permissions = Object.entries(\n    member.permissions && typeof member.permissions === "object"\n      ? member.permissions\n      : {},\n  )\n    .filter(([, allowed]) => Boolean(allowed))\n    .map(([key]) => key.replaceAll("_", " "));\n  return <div className="grid gap-5 xl:grid-cols-[.85fr_1.35fr]">\n    <Card title={member.name || member.email || "Administrator"}>\n      <DetailGrid values={[\n        ["Role", member.is_super_admin ? "Super Admin" : member.role || "Admin"],\n        ["Status", member.status || "Invited"],\n        ["Email", member.email],\n        ["Phone", member.phone || "Not recorded"],\n        ["Invited", date(member.invited_at || member.created_at)],\n        ["Activated", date(member.activated_at)],\n      ]}/>\n      <div className="mt-4 rounded-xl bg-cream p-4">\n        <b className="text-xs text-plum">Assigned sections</b>\n        <div className="mt-2 flex flex-wrap gap-2">\n          {member.is_super_admin ? (\n            <span className="rounded-full bg-blush px-3 py-1.5 text-xs font-bold text-plum">All platform sections</span>\n          ) : permissions.map((permission) => (\n            <span key={permission} className="rounded-full bg-blush px-3 py-1.5 text-xs font-bold text-plum">{permission}</span>\n          ))}\n          {!member.is_super_admin && !permissions.length ? (\n            <span className="text-xs text-ink/55">No active section permissions.</span>\n          ) : null}\n        </div>\n      </div>\n      <Link href="/admin/settings/team" className="mt-4 inline-flex rounded-lg bg-magenta px-4 py-2 text-xs font-bold text-white">\n        Manage invitation, status, and permissions\n      </Link>\n    </Card>\n    <AdminUserActivityTimeline memberId={String(member.id)} />\n  </div>;\n}\n\n`,
);

replaceOnce(
  "src/components/admin/AdminSalonsManager.tsx",
  `import { useAdminListScrollRestoration } from "@/components/admin/useAdminListContext";`,
  `import { useAdminListScrollRestoration } from "@/components/admin/useAdminListContext";\nimport AdminSalon360Sections from "@/components/admin/AdminSalon360Sections";`,
);
replaceOnce(
  "src/components/admin/AdminSalonsManager.tsx",
  `              {data.lifecycle ? (`,
  `              <AdminSalon360Sections data={data} />\n              {data.lifecycle ? (`,
);

replaceOnce(
  "src/components/admin/AdminSalon360Sections.tsx",
  `import { useMemo, useState } from "react";`,
  `import { useState } from "react";`,
);
replaceOnce(
  "src/components/admin/AdminSalon360Sections.tsx",
  `  const owner = useMemo(\n    () => team.find((member) => /owner/i.test(text(member.role))) || team[0],\n    [team],\n  );`,
  `  const owner =\n    team.find((member) => /owner/i.test(text(member.role))) || team[0];`,
);

console.log("Admin activity, Salon 360, and owner-badge wiring applied.");
