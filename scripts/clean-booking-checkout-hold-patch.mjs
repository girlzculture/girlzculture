import { readFileSync, writeFileSync } from "node:fs";

function replaceExactlyOnce(path, before, after) {
  const source = readFileSync(path, "utf8");
  const first = source.indexOf(before);
  if (first < 0) {
    throw new Error(`Missing expected generated duplicate in ${path}: ${before}`);
  }
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Expected exactly one generated duplicate in ${path}: ${before}`);
  }
  writeFileSync(
    path,
    source.slice(0, first) + after + source.slice(first + before.length),
  );
}

replaceExactlyOnce(
  "src/app/api/admin/bookings/route.ts",
  "      const deliveryWarnings: string[] = [];\n      const deliveryWarnings: string[] = [];",
  "      const deliveryWarnings: string[] = [];",
);
replaceExactlyOnce(
  "src/app/api/admin/bookings/route.ts",
  "      return Response.json({\n      return Response.json({",
  "      return Response.json({",
);
replaceExactlyOnce(
  "src/app/api/stripe/booking-checkout/route.ts",
  "  } catch (error) {\n  } catch (error) {",
  "  } catch (error) {",
);

console.log("Checkout hold patch boundary duplicates removed.");
