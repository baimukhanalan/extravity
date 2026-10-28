export default function NewsLoading() {
  return <div className="mx-auto max-w-6xl animate-pulse px-4 py-10" aria-label="Загрузка новостей">
    <div className="h-12 w-72 rounded-lg bg-surface-muted" />
    <div className="mt-4 h-5 w-full max-w-xl rounded bg-surface-muted" />
    <div className="mt-10 flex gap-2">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-9 w-20 rounded-full bg-surface-muted" />)}</div>
    <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-64 rounded-2xl bg-surface-muted" />)}</div>
  </div>;
}
