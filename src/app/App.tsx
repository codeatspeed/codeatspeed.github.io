export function App() {
  return (
    <main className="app-shell">
      <div className="app-shell__eyebrow">Read / Focus</div>
      <h1>Make space for the next word.</h1>
      <p>
        A focused speed reader for the books and notes you want to stay with.
      </p>
      <div className="app-shell__placeholder" aria-live="polite">
        Your reading space is ready.
      </div>
    </main>
  );
}

export default App;
