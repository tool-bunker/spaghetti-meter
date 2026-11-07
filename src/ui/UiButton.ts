import { Button } from "@pixi/ui";
import { Container, Graphics, Rectangle, Text } from "pixi.js";
import { COLORS, FONTS } from "./theme";

export type UiButtonVariant = "primary" | "text" | "circle" | "github";
export type UiButtonIcon = "folder" | "replay";

interface UiButtonOptions {
  label: string;
  accessibleLabel?: string;
  accessibleHint?: string;
  variant?: UiButtonVariant;
  icon?: UiButtonIcon;
  onPress: () => void;
}

type VisualState = "default" | "hover" | "pressed" | "active";

export class UiButton extends Container {
  private readonly background = new Graphics();
  private readonly labelView: Text;
  private readonly iconView = new Graphics();
  private readonly button: Button;
  private readonly variant: UiButtonVariant;
  private readonly icon?: UiButtonIcon;
  private widthValue = 0;
  private heightValue = 0;
  private visualState: VisualState = "default";

  constructor(options: UiButtonOptions) {
    super({ label: `button-${options.label.toLowerCase().replaceAll(" ", "-")}` });
    this.variant = options.variant ?? "text";
    this.icon = options.icon;
    const isCircle = this.variant === "circle";
    const isGithub = this.variant === "github";
    this.labelView = new Text({
      text: options.label,
      style: {
        fill: isGithub ? 0xffffff : this.variant === "primary" ? COLORS.accentDark : COLORS.action,
        fontFamily: isCircle ? FONTS.display : FONTS.sans,
        fontSize: this.variant === "primary" ? 14 : isCircle ? 17 : 12,
        fontStyle: "normal",
        fontWeight: this.variant === "primary" || isGithub ? "700" : "500",
      },
      anchor: 0.5,
    });
    this.labelView.visible = !(isCircle && this.icon !== undefined);
    this.background.eventMode = "none";
    this.labelView.eventMode = "none";
    this.iconView.eventMode = "none";
    this.addChild(this.background, this.iconView, this.labelView);

    this.eventMode = "static";
    this.cursor = "pointer";
    this.accessible = true;
    this.accessibleType = "button";
    this.accessibleTitle = options.accessibleLabel ?? options.label;
    this.accessibleHint = options.accessibleHint;
    this.tabIndex = 0;

    this.button = new Button(this);
    this.button.onHover.connect(() => this.setVisualState("hover"));
    this.button.onOut.connect(() => this.setVisualState("default"));
    this.button.onDown.connect(() => this.setVisualState("pressed"));
    this.button.onUp.connect(() => this.setVisualState("hover"));
    this.button.onUpOut.connect(() => this.setVisualState("default"));
    this.button.onPress.connect(options.onPress);

    const defaultWidth = this.variant === "primary"
      ? 190
      : this.variant === "circle"
        ? 34
        : this.variant === "github"
          ? 310
          : 180;
    const defaultHeight = this.variant === "primary" || this.variant === "github"
      ? 46
      : this.variant === "circle"
        ? 34
        : 28;
    this.resize(defaultWidth, defaultHeight);
  }

  resize(width: number, height: number): void {
    this.widthValue = width;
    this.heightValue = height;
    this.hitArea = new Rectangle(0, 0, width, height);
    this.redraw();
  }

  setLabel(label: string, accessibleLabel = label): void {
    this.labelView.text = label;
    this.accessibleTitle = accessibleLabel;
    this.layoutContent();
  }

  setActive(active: boolean): void {
    this.setVisualState(active ? "active" : "default");
  }

  setEnabled(enabled: boolean): void {
    this.button.enabled = enabled;
    this.alpha = enabled ? 1 : 0.45;
    this.cursor = enabled ? "pointer" : "default";
  }

  private setVisualState(state: VisualState): void {
    this.visualState = state;
    this.redraw();
  }

  private redraw(): void {
    const width = this.widthValue;
    const height = this.heightValue;
    const hovered = this.visualState === "hover" || this.visualState === "active";
    const pressed = this.visualState === "pressed";
    this.background.clear();

    if (this.variant === "primary") {
      this.background
        .roundRect(0, 0, width, height, height / 2)
        .fill(pressed ? 0xefc34e : hovered ? COLORS.accentHover : COLORS.accent);
      this.labelView.style.fill = COLORS.accentDark;
    } else if (this.variant === "github") {
      this.background
        .roundRect(0, 0, width, height, 8)
        .fill(pressed ? 0x010409 : hovered ? 0x30363d : 0x24292f)
        .stroke({ color: 0x57606a, alpha: hovered ? 1 : 0.5, width: 1 });
      this.labelView.style.fill = 0xffffff;
    } else if (this.variant === "circle") {
      this.background
        .circle(width / 2, height / 2, Math.min(width, height) / 2 - 1)
        .fill({ color: COLORS.background, alpha: 0.72 })
        .stroke({ color: hovered ? COLORS.accent : COLORS.text, alpha: hovered ? 1 : 0.3, width: 1 });
      this.labelView.style.fill = hovered ? COLORS.accent : COLORS.action;
    } else {
      this.labelView.style.fill = hovered ? COLORS.accent : COLORS.action;
      const lineWidth = Math.min(width - 8, Math.max(54, this.labelView.width + 4));
      this.background
        .moveTo((width - lineWidth) / 2, height - 2)
        .lineTo((width + lineWidth) / 2, height - 2)
        .stroke({ color: hovered ? COLORS.accent : COLORS.action, alpha: hovered ? 1 : 0.36, width: 1 });
    }

    this.scale.set(pressed ? 0.98 : 1);
    this.layoutContent();
  }

  private layoutContent(): void {
    const centerX = this.widthValue / 2;
    const centerY = this.heightValue / 2;
    this.iconView.clear();
    if (this.icon === "folder") {
      const circleIcon = this.variant === "circle";
      const hovered = this.visualState === "hover" || this.visualState === "active";
      const color = circleIcon
        ? (hovered ? COLORS.accent : COLORS.action)
        : COLORS.accentDark;
      const iconX = circleIcon ? centerX - 9 : centerX - this.labelView.width / 2 - 19;
      const iconY = circleIcon ? centerY - 4 : centerY - 5;
      this.iconView
        .roundRect(iconX, iconY, 18, 13, 2)
        .stroke({ color, width: 2 })
        .moveTo(iconX, iconY)
        .lineTo(iconX + 2, iconY - 5)
        .lineTo(iconX + 10, iconY - 5)
        .lineTo(iconX + 12, iconY)
        .stroke({ color, width: 2 });
      this.labelView.position.set(circleIcon ? centerX : centerX + 8, centerY);
    } else if (this.icon === "replay") {
      const hovered = this.visualState === "hover" || this.visualState === "active";
      const color = hovered ? COLORS.accent : COLORS.action;
      this.iconView
        .arc(centerX, centerY, 7, -Math.PI * 0.25, Math.PI * 1.5)
        .stroke({ color, width: 1.8, cap: "round" })
        .moveTo(centerX, centerY - 7)
        .lineTo(centerX - 4, centerY - 10)
        .moveTo(centerX, centerY - 7)
        .lineTo(centerX - 4, centerY - 4)
        .stroke({ color, width: 1.8, cap: "round", join: "round" });
      this.labelView.position.set(centerX, centerY);
    } else {
      this.labelView.position.set(centerX, centerY);
    }
  }
}
