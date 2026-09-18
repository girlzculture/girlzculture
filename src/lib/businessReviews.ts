type Row = Record<string, unknown>;
export const REVIEW_VIEWS = ['recent', 'awaiting', 'replied', 'disputed', 'removed', 'all'] as const;
export type ReviewView = typeof REVIEW_VIEWS[number];
export function reviewState(review: Row) {
  if (review.archived_at || review.moderation_status === 'Hidden' || review.dispute_status === 'Removed') return 'removed';
  if (review.moderation_status !== 'Published' && review.moderation_status != null || review.dispute_status === 'Disputed') return 'disputed';
  return String(review.salon_reply || '').trim() ? 'replied' : 'awaiting';
}
export function publicReview(review: Row) {
  return !review.archived_at && (review.moderation_status ?? 'Published') === 'Published' && review.dispute_status !== 'Removed';
}
export function reviewMetrics(reviews: Row[], timeZone: string) {
  const published = reviews.filter(publicReview).filter(r => Number.isFinite(Number(r.rating_overall)) && Number(r.rating_overall) >= 1 && Number(r.rating_overall) <= 5);
  const counts = Object.fromEntries(REVIEW_VIEWS.map(view => [view, reviews.filter(r => view === 'all' || (view === 'recent' ? reviewState(r) !== 'removed' : reviewState(r) === view)).length]));
  const months = new Map<string, {total: number; count: number}>();
  for (const row of published) {
    if (!Number.isFinite(Date.parse(String(row.created_at)))) continue;
    const parts = new Intl.DateTimeFormat('en-US', {timeZone, year:'numeric', month:'2-digit'}).formatToParts(new Date(String(row.created_at)));
    const key = `${parts.find(p=>p.type==='year')!.value}-${parts.find(p=>p.type==='month')!.value}`;
    const point = months.get(key) || {total:0,count:0}; point.total += Number(row.rating_overall); point.count++; months.set(key, point);
  }
  return {counts, total:published.length, average:published.length ? published.reduce((sum,r)=>sum+Number(r.rating_overall),0)/published.length : null,
    highRating:published.filter(r=>Number(r.rating_overall)>=4).length,
    distribution:[5,4,3,2,1].map(star=>({star,count:published.filter(r=>Math.round(Number(r.rating_overall))===star).length})),
    trend:[...months].sort(([a],[b])=>a.localeCompare(b)).slice(-6).map(([month,p])=>({month,count:p.count,average:p.total/p.count}))};
}
export function filterReviews(reviews: Row[], filters: {view:string;query:string;rating:string;service:string}, bookings: Row[]) {
  const needle=filters.query.trim().toLocaleLowerCase();
  return reviews.filter(review => (filters.view==='all'||(filters.view==='recent'?reviewState(review)!=='removed':reviewState(review)===filters.view))
    && (!filters.rating||Math.round(Number(review.rating_overall))===Number(filters.rating))
    && (!filters.service||bookings.some(b=>b.id===review.booking_id&&b.style_id===filters.service))
    && (!needle||[review.display_name,review.review_title,review.written_review,review.booking_id].some(v=>String(v||'').toLocaleLowerCase().includes(needle))))
    .sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))||String(a.id).localeCompare(String(b.id)));
}
