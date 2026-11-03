export default function Loading() {
  return (
    <div className="loading-delayed" aria-busy="true">
      <div className="skeleton skeleton-title" />
      <div className="stats">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton skeleton-stat" />
        ))}
      </div>
      <div className="skeleton skeleton-table" />
    </div>
  );
}
