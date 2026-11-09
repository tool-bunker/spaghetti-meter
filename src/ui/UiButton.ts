import { Button } from "@pixi/ui";
import { Container, Graphics, Rectangle, Text } from "pixi.js";
import { COLORS, FONTS } from "./theme";
const TOOLTIP_TIMEOUT_MS = 1_200;

export type UiButtonVariant = "primary" | "text" | "circle" | "github";
export type UiButtonIcon = "folder" | "replay" | "export";

interface UiButtonOptions {
  label: string;
  accessibleLabel?: string;
  accessibleHint?: string;
  tooltip?: string;
  tooltipAlign?: "left" | "center" | "right";
  variant?: UiButtonVariant;
  icon?: UiButtonIcon;
  onPress: () => void;
}

type VisualState = "default" | "hover" | "pressed" | "active";

export class UiButton extends Container {
  private readonly background = new Graphics();
  private readonly labelView: Text;
  private readonly iconView = new Graphics();
  private readonly tooltipBackground = new Graphics({ eventMode: "none" });
  private readonly tooltipView: Text;
  private readonly button: Button;
  private readonly variant: UiButtonVariant;
  private icon?: UiButtonIcon;
  private readonly tooltipAlign: "left" | "center" | "right";
  private widthValue = 0;
  private heightValue = 0;
  private visualState: VisualState = "default";
  private enabled = true;
  private tooltipHideTimer: number | undefined;

  constructor(options: UiButtonOptions) {
    super({ label: `button-${options.label.toLowerCase().replaceAll(" ", "-")}` });
    this.variant = options.variant ?? "text";
    this.icon = options.icon;
    this.tooltipAlign = options.tooltipAlign ?? "center";
    const isCircle = this.variant === "circle";
    const isGithub = this.variant === "github";
    this.labelView = new Text({
      text: options.label,
      style: {
        fill: isGithub ? COLORS.text : this.variant === "primary" ? COLORS.accentDark : COLORS.action,
        fontFamily: isCircle ? FONTS.display : FONTS.sans,
        fontSize: this.variant === "primary" ? 14 : isCircle ? 17 : 12,
        fontStyle: "normal",
        fontWeight: this.variant === "primary" || isGithub ? "700" : "500",
      },
      anchor: 0.5,
    });
    const tooltip = options.tooltip
      ?? (isCircle ? options.accessibleLabel ?? options.label : "");
    this.tooltipView = new Text({
      text: tooltip,
      style: {
        fill: COLORS.text,
        fontFamily: FONTS.sans,
        fontSize: 11,
        fontWeight: "600",
      },
      anchor: { x: 0.5, y: 0 },
      eventMode: "none",
    });
    this.tooltipView.visible = false;
    this.tooltipBackground.visible = false;
    this.labelView.visible = !(isCircle && this.icon !== undefined);
    this.background.eventMode = "none";
    this.labelView.eventMode = "none";
    this.iconView.eventMode = "none";
    this.addChild(
      this.background,
      this.iconView,
      this.labelView,
      this.tooltipBackground,
      this.tooltipView,
    );

    this.eventMode = "static";
    this.cursor = "pointer";
    this.accessible = true;
    this.accessibleType = "button";
    this.accessibleTitle = options.accessibleLabel ?? options.label;
    this.accessibleHint = options.accessibleHint;
    this.tabIndex = 0;

    this.button = new Button(this);
    this.button.onHover.connect(() => {
      this.setVisualState("hover");
      this.setTooltipVisible(true);
    });
    this.button.onOut.connect(() => {
      this.setVisualState("default");
      this.setTooltipVisible(false);
    });
    this.button.onDown.connect(() => {
      this.setVisualState("pressed");
      this.setTooltipVisible(true);
    });
    this.button.onUp.connect(() => {
      this.setVisualState("hover");
      this.setTooltipVisible(false);
    });
    this.button.onUpOut.connect(() => {
      this.setVisualState("default");
      this.setTooltipVisible(false);
    });
    this.button.onPress.connect(() => {
      this.setTooltipVisible(false);
      options.onPress();
    });
    this.on("pointerout", () => {
      this.setVisualState("default");
      this.setTooltipVisible(false);
    });

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
  setIcon(icon: UiButtonIcon): void {
    if (this.icon === icon) return;
    this.icon = icon;
    this.layoutContent();
  }

  setTooltip(tooltip: string): void {
    this.tooltipView.text = tooltip;
    this.layoutTooltip();
  }


  setActive(active: boolean): void {
    this.setVisualState(active ? "active" : "default");
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.button.enabled = enabled;
    if (!enabled) this.setTooltipVisible(false);
    this.cursor = enabled ? "pointer" : "default";
    this.applyOpacity();
  }

  private setVisualState(state: VisualState): void {
    this.visualState = state;
    this.redraw();
    this.applyOpacity();
  }

  private redraw(): void {
    const width = this.widthValue;
    const height = this.heightValue;
    const hovered = this.visualState === "hover" || this.visualState === "active";
    const pressed = this.visualState === "pressed";
    this.background.clear();

    if (this.variant === "primary") {
      this.background
        .roundRect(0, 0, width, height, 5)
        .fill(hovered || pressed ? COLORS.primaryPressed : COLORS.primary)
        .stroke({ color: COLORS.primary, alpha: hovered ? 1 : 0.8, width: 1 });
      this.labelView.style.fill = COLORS.accentDark;
    } else if (this.variant === "github") {
      this.background
        .roundRect(0, 0, width, height, 8)
        .fill(pressed ? COLORS.background : hovered ? COLORS.panelStrong : COLORS.panel)
        .stroke({ color: COLORS.secondary, alpha: hovered ? 0.9 : 0.45, width: 1 });
      this.labelView.style.fill = COLORS.text;
    } else if (this.variant === "circle") {
      this.background
        .circle(width / 2, height / 2, Math.min(width, height) / 2 - 1)
        .fill({ color: COLORS.panel, alpha: hovered ? 0.88 : 0.56 })
        .stroke({
          color: hovered ? COLORS.secondary : COLORS.text,
          alpha: hovered ? 0.92 : 0.18,
          width: 1,
        });
      this.labelView.style.fill = hovered ? COLORS.secondary : COLORS.muted;
    } else {
      this.labelView.style.fill = hovered ? COLORS.secondary : COLORS.action;
      const lineWidth = Math.min(width - 8, Math.max(54, this.labelView.width + 4));
      this.background
        .moveTo((width - lineWidth) / 2, height - 2)
        .lineTo((width + lineWidth) / 2, height - 2)
        .stroke({ color: hovered ? COLORS.secondary : COLORS.action, alpha: hovered ? 1 : 0.36, width: 1 });
    }

    this.scale.set(pressed ? 0.98 : 1);
    this.layoutContent();
    this.layoutTooltip();
    this.applyOpacity();
  }

  private layoutContent(): void {
    const centerX = this.widthValue / 2;
    const centerY = this.heightValue / 2;
    this.iconView.clear();
    switch (this.icon) {
      case "folder":
        this.drawFolderIcon(centerX, centerY);
        break;
      case "replay":
        this.drawReplayIcon(centerX, centerY);
        break;
      case "export":
        this.drawExportIcon(centerX, centerY);
        break;
      default:
        this.labelView.position.set(centerX, centerY);
    }
  }

  private drawFolderIcon(centerX: number, centerY: number): void {
    const circleIcon = this.variant === "circle";
    const color = circleIcon ? this.circleIconColor() : COLORS.accentDark;
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
  }

  private drawReplayIcon(centerX: number, centerY: number): void {
    const color = this.circleIconColor();
    this.iconView
      .arc(centerX, centerY, 7, -Math.PI * 0.25, Math.PI * 1.5)
      .stroke({ color, width: 1.8, cap: "round" })
      .moveTo(centerX, centerY - 7)
      .lineTo(centerX - 4, centerY - 10)
      .moveTo(centerX, centerY - 7)
      .lineTo(centerX - 4, centerY - 4)
      .stroke({ color, width: 1.8, cap: "round", join: "round" });
    this.labelView.position.set(centerX, centerY);
  }

  private drawExportIcon(centerX: number, centerY: number): void {
    const color = this.circleIconColor();
    this.iconView
      .moveTo(centerX, centerY - 8)
      .lineTo(centerX, centerY + 3)
      .moveTo(centerX - 4, centerY - 1)
      .lineTo(centerX, centerY + 3)
      .lineTo(centerX + 4, centerY - 1)
      .stroke({ color, width: 1.8, cap: "round", join: "round" })
      .moveTo(centerX - 7, centerY + 5)
      .lineTo(centerX - 7, centerY + 8)
      .lineTo(centerX + 7, centerY + 8)
      .lineTo(centerX + 7, centerY + 5)
      .stroke({ color, width: 1.8, cap: "round", join: "round" });
    this.labelView.position.set(centerX, centerY);
  }



  private circleIconColor(): number {
    const highlighted = this.visualState === "hover" || this.visualState === "active";
    return highlighted ? COLORS.secondary : COLORS.muted;
  }

  private setTooltipVisible(visible: boolean): void {
    if (this.tooltipHideTimer !== undefined) {
      window.clearTimeout(this.tooltipHideTimer);
      this.tooltipHideTimer = undefined;
    }
    const show = visible && this.enabled && this.tooltipView.text.length > 0;
    this.tooltipBackground.visible = show;
    this.tooltipView.visible = show;
    if (show) {
      this.tooltipHideTimer = window.setTimeout(() => {
        this.tooltipHideTimer = undefined;
        this.tooltipBackground.visible = false;
        this.tooltipView.visible = false;
      }, TOOLTIP_TIMEOUT_MS);
    }
  }

  private layoutTooltip(): void {
    const paddingX = 7;
    const paddingY = 4;
    const anchorX = this.tooltipAlign === "left"
      ? 0
      : this.tooltipAlign === "right"
        ? 1
        : 0.5;
    const textX = this.tooltipAlign === "left"
      ? 0
      : this.tooltipAlign === "right"
        ? this.widthValue
        : this.widthValue / 2;
    this.tooltipView.anchor.x = anchorX;
    this.tooltipView.position.set(textX, this.heightValue + 9);
    const backgroundX = textX - this.tooltipView.width * anchorX - paddingX;
    this.tooltipBackground.clear()
      .roundRect(
        backgroundX,
        this.heightValue + 6,
        this.tooltipView.width + paddingX * 2,
        this.tooltipView.height + paddingY * 2,
        4,
      )
      .fill({ color: COLORS.background, alpha: 0.9 })
      .stroke({ color: COLORS.panelBorder, alpha: 0.55, width: 1 });
  }

  private applyOpacity(): void {
    if (!this.enabled) {
      this.alpha = 0.35;
      return;
    }
    const highlighted = this.visualState === "hover"
      || this.visualState === "pressed"
      || this.visualState === "active";
    this.alpha = this.variant === "circle" && !highlighted ? 0.66 : 1;
  }
}
