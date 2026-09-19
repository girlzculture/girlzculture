# Booth-renter export projection

Scope: SF-TAX's applicable booth-renter reporting, alongside FIN-10 and FIN-13. The Finance UI and canonical operating-book summary already distinguished rent due and rent received per professional. The exported professional summary omitted both, although the spreadsheet separately contained individual rent payment records.

`businessFinanceReport.ts` now appends the existing four-language **Booth rent due** and **Booth rent received** columns to the professional summary, using `by_stylist.booth_rent_due_cents` and `by_stylist.booth_rent_paid_cents`. PDF and XLSX consume the same report. The existing PDF continuation tables repeat the professional's name and retain all eight fields. No ledger calculation, scope reader, endpoint, renderer, catalog, database or provider behavior changed.

## Evidence

- **FAIL, retained BEFORE:** both new focused cases failed against the original report: missing rent header, and missing due value. `../redesign-evidence/finance-booth-export-before.log` records 0 passed / 2 failed.
- **PASS:** the full existing export test file now passes **8/8**, zero skipped; the six original cases and assertions remain. `finance-booth-export-after.log` records the run. Cases produce actual PDF/XLSX output for business and own-professional scopes in EN/FR/ES/zh-CN, read XLSX cells back as numeric values, and preserve period/time zone/USD and original names.
- **PASS:** the fixture reports professional service sales of $100, rent due $200 and rent received $75, with zero business-owned service sales and zero compensation paid. Rent earned contributes once to recorded profit; receiving it is not a second sale or customer receipt. Prior-local-day obligations and next-period payments remain outside the selected period; zero, empty and mixed-business rent cases are covered.
- **PASS:** scoped ESLint and full TypeScript checks exited 0 (`finance-booth-export-lint.log`, `finance-booth-export-types.log`); independent source/test review found no blocker.
- **PASS, bounded rendered review:** inspected all eight affected PDF pages rendered by bundled Poppler and all eight professional-sheet captures from the actual generated XLSX files using the bundled spreadsheet renderer. Headers, original names, $200/$75 values and separate compensation are readable in both scopes and all four locales. Business PDF samples have four pages; own-professional samples have three. No dependency installation was needed.

Artifacts are outside Git in `../redesign-evidence/finance-booth-export-artifacts/`: `booth-{business|own}-{locale}.pdf`, `.xlsx`, `-page-3.png` and `-sheet.png`. Renderer logs are `finance-booth-export-pdf-render.log` and `finance-booth-export-sheet-render.log`. An initially ambiguous resized Spanish spreadsheet preview was checked at original resolution; its full headers fit, so no renderer/style change was made.

## Limits

**AUTOMATED ONLY:** transport/permission tests and synthetic report records do not establish deployed role access or production data accuracy. The rendered checks cover the affected report tables, not native Excel behavior, every possible name length or the entire SF-TAX requirement. These are organized recorded values, not tax advice, filing or certification. Current-source CI/build and authorized hosted acceptance remain separate release gates. No browser/build, provider request, production mutation, staging or commit was performed by this slice.
