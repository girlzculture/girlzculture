/** Loading cards use the same compact widths as MarketplaceSalonCard so a
 * homepage row does not become a tall stack while discovery is pending. */
export default function SalonCardSkeletons({ label, count = 4, grid = false }: {
  label: string;
  count?: number;
  grid?: boolean;
}) {
  return <div role="status" aria-live="polite" aria-label={label}
    className={grid
      ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      : "-mx-4 flex gap-3 overflow-hidden px-4 pb-3 sm:mx-0 sm:px-0"}>
    {Array.from({ length: count }, (_, index) => <div key={index} aria-hidden="true"
      className={"overflow-hidden rounded-[14px] border border-plum/10 bg-white motion-safe:animate-pulse " + (grid
        ? "min-w-0"
        : "w-[calc((100vw-44px)/2)] min-w-[154px] max-w-[210px] shrink-0 sm:w-[230px] sm:max-w-[230px] lg:w-[260px] lg:max-w-[260px]")}>
      <div className={(grid ? "aspect-[16/10]" : "aspect-[16/9]") + " bg-blush/70"} />
      <div className={grid ? "p-3" : "p-2.5"}>
        <div className="h-5 w-2/3 rounded bg-blush" />
        <div className="mt-1 h-3 w-1/2 rounded bg-blush" />
        <div className="mt-1.5 h-5 w-2/5 rounded bg-blush" />
        <div className={(grid ? "" : "hidden sm:block ") + "mt-3 h-10 rounded-lg bg-blush"} />
      </div>
    </div>)}
  </div>;
}
