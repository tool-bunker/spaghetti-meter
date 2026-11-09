import { Container } from "pixi.js";
import { UiButton } from "./UiButton";

export type ExportFormat = "image" | "gif" | "video";

const ITEM_WIDTH = 72;
const ITEM_HEIGHT = 28;

const EXPORT_ITEMS = [
  { format: "image", label: "IMAGE", hint: "Save the completed result as a PNG image" },
  { format: "gif", label: "GIF", hint: "Replay and save the result as an animated GIF" },
  { format: "video", label: "VIDEO", hint: "Replay and save the result as a silent video" },
] as const;

export class ExportMenu extends Container {
  private readonly buttons: UiButton[];

  constructor(onSelect: (format: ExportFormat) => void) {
    super({ label: "export-format-menu", eventMode: "none", visible: false });
    this.buttons = EXPORT_ITEMS.map((item, index) => {
      const button = new UiButton({
        label: item.label,
        accessibleLabel: `Export ${item.label.toLowerCase()}`,
        accessibleHint: item.hint,
        variant: "text",
        onPress: () => onSelect(item.format),
      });
      button.resize(ITEM_WIDTH, ITEM_HEIGHT);
      button.position.set(index * ITEM_WIDTH, 0);
      return button;
    });
    this.addChild(...this.buttons);
  }

  get menuWidth(): number {
    return ITEM_WIDTH * this.buttons.length;
  }

  setOpen(open: boolean): void {
    this.visible = open;
    this.eventMode = open ? "passive" : "none";
    for (const button of this.buttons) button.setEnabled(open);
  }
}
