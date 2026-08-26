import { readFileSync, writeFileSync } from "node:fs";

const path = "src/app/api/admin/finance/payout/route.ts";
let source = readFileSync(path, "utf8");

function replaceOnce(before, after) {
  const first = source.indexOf(before);
  if (first < 0) {
    throw new Error(`Missing expected payout source: ${before.slice(0, 160)}`);
  }
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Expected one payout source match: ${before.slice(0, 160)}`);
  }
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
  `  } catch (error) {\n    const reference = monitoringAdmin`,
  `  } catch (error) {\n    const deliveryUncertain = Boolean(\n      stripeTransferId ||\n        (error as { deliveryUncertain?: boolean }).deliveryUncertain === true,\n    );\n    const reference = monitoringAdmin`,
);

replaceOnce(
  `          p_outcome: stripeTransferId ? "uncertain" : "failed",\n          p_stripe_transfer_id: stripeTransferId || null,\n          p_provider_status: stripeTransferId\n            ? "reconciliation_required"\n            : "failed",`,
  `          p_outcome: deliveryUncertain ? "uncertain" : "failed",\n          p_stripe_transfer_id: stripeTransferId || null,\n          p_provider_status: deliveryUncertain\n            ? "reconciliation_required"\n            : "failed",`,
);

replaceOnce(
  `        error: stripeTransferId\n          ? reference\n            ? \`Stripe returned transfer \${stripeTransferId}, but the local payout record needs reconciliation. Do not create a new payout. Review reference \${reference}.\`\n            : \`Stripe returned transfer \${stripeTransferId}, but the local payout record needs reconciliation. Do not create a new payout.\`\n          : reference\n            ? \`The salon transfer was not completed. Review reference \${reference} before retrying.\`\n            : "The salon transfer was not completed.",\n        reference,\n        transfer_id: stripeTransferId || null,\n        reconciliation_required: Boolean(stripeTransferId),`,
  `        error: deliveryUncertain\n          ? stripeTransferId\n            ? reference\n              ? \`Stripe returned transfer \${stripeTransferId}, but the local payout record needs reconciliation. Do not create a new payout. Review reference \${reference}.\`\n              : \`Stripe returned transfer \${stripeTransferId}, but the local payout record needs reconciliation. Do not create a new payout.\`\n            : reference\n              ? \`Stripe transfer submission may have reached the provider, but confirmation was not received. Do not create a new payout. Review reference \${reference}.\`\n              : "Stripe transfer submission may have reached the provider, but confirmation was not received. Do not create a new payout."\n          : reference\n            ? \`The salon transfer was not completed. Review reference \${reference} before retrying.\`\n            : "The salon transfer was not completed.",\n        reference,\n        transfer_id: stripeTransferId || null,\n        reconciliation_required: deliveryUncertain,`,
);

writeFileSync(path, source);
console.log("Stripe payout uncertainty safety patch applied.");
