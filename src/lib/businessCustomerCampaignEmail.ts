/** Approved user prose and localized labels are escaped, never interpreted as HTML. */
export function campaignHtml(copy: { title: string; body: string }, bookingUrl: string, unsubscribeUrl: string, labels: { book: string; unsubscribe: string; reason: string }) {
 const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
 return `<h1>${escape(copy.title)}</h1><p>${escape(copy.body).replace(/\n/g, "<br>")}</p><p><a href="${escape(bookingUrl)}">${escape(labels.book)}</a></p><p>${escape(labels.reason)}</p><p><a href="${escape(unsubscribeUrl)}">${escape(labels.unsubscribe)}</a></p>`;
}
