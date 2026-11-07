const NOTICE_PATH = "THIRD_PARTY_LICENSES.txt";

export class LicenseDialog {
  private readonly dialog = document.createElement("dialog");
  private readonly notice = document.createElement("pre");
  private loadPromise?: Promise<void>;

  constructor() {
    this.dialog.className = "license-dialog";
    this.dialog.setAttribute("aria-labelledby", "license-dialog-title");

    const header = document.createElement("div");
    header.className = "license-dialog__header";

    const title = document.createElement("h1");
    title.id = "license-dialog-title";
    title.textContent = "Third-party licenses";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "license-dialog__close";
    closeButton.setAttribute("aria-label", "Close third-party licenses");
    closeButton.textContent = "×";
    closeButton.addEventListener("click", () => this.dialog.close());

    this.notice.className = "license-dialog__notice";
    this.notice.tabIndex = 0;
    this.notice.textContent = "Loading license notices…";

    header.append(title, closeButton);
    this.dialog.append(header, this.notice);
    this.dialog.addEventListener("click", this.closeFromBackdrop);
    document.body.appendChild(this.dialog);
  }

  show(): void {
    if (!this.dialog.open) this.dialog.showModal();
    this.loadPromise ??= this.load();
  }

  destroy(): void {
    this.dialog.removeEventListener("click", this.closeFromBackdrop);
    this.dialog.remove();
  }

  private readonly closeFromBackdrop = (event: MouseEvent): void => {
    if (event.target === this.dialog) this.dialog.close();
  };

  private async load(): Promise<void> {
    try {
      const response = await fetch(NOTICE_PATH);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.notice.textContent = await response.text();
    } catch (error) {
      this.notice.textContent = `Could not load the bundled license notices.\n\n${String(error)}`;
    }
  }
}
