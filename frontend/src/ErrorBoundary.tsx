import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** "page" replaces the whole app; "section" only the failing tab. */
  scope: "page" | "section";
};
type State = { error: Error | null };

/** A render error shows a recoverable message instead of a blank page. Saved
 * data is unaffected: only what was being drawn failed. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("Ekran çizilemedi:", error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    const page = this.props.scope === "page";
    return (
      <div className="error-boundary" role="alert">
        <strong>
          {page
            ? "Uygulama beklenmeyen bir hata nedeniyle gösterilemedi."
            : "Bu ekran beklenmeyen bir hata nedeniyle gösterilemedi."}
        </strong>
        <p>
          Kaydedilmiş verileriniz etkilenmedi. Kaydedilmemiş son düzenlemeniz
          varsa yeniden girmeniz gerekebilir.
          {page ? "" : " Diğer sekmeleri kullanmaya devam edebilirsiniz."}
        </p>
        <div>
          {!page && (
            <button
              type="button"
              className="button"
              onClick={() => this.setState({ error: null })}
            >
              Yeniden Dene
            </button>
          )}
          <button
            type="button"
            className="button primary"
            onClick={() => window.location.reload()}
          >
            Sayfayı Yenile
          </button>
        </div>
      </div>
    );
  }
}
