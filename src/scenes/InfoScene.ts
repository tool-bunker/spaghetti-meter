import { openUrl } from "@tauri-apps/plugin-opener";
import { Container, Graphics, Text, type TextStyleOptions } from "pixi.js";
import { UiButton } from "../ui/UiButton";
import { COLORS, FONTS } from "../ui/theme";

const BOLD_FONT_WEIGHT = "bold";
const COMPACT_LAYOUT_MAX_WIDTH = 700;

const CODE_BUSTER_REPOSITORY_URL = "https://github.com/tool-bunker/code-buster";

export class InfoScene extends Container {
  private readonly background = new Graphics();
  private readonly glow = new Graphics();
  private readonly eyebrow = centeredText("ABOUT SPAGHETTI METER", {
    fill: COLORS.red,
    fontFamily: FONTS.mono,
    fontSize: 10,
    fontWeight: BOLD_FONT_WEIGHT,
    letterSpacing: 2,
  });
  private readonly title = centeredText("A playful second opinion", {
    fill: COLORS.heading,
    fontFamily: FONTS.display,
    fontSize: 56,
    fontWeight: "500",
    letterSpacing: -2,
    align: "center",
  });
  private readonly body = new Text({
    text:
      "Spaghetti Meter turns Code Buster findings into a deliberately lighthearted score. "
      + "It is a conversation starter, not a final verdict on your repository.\n\n"
      + "Take the result with a grain of salt. Every repository has its own context, so if a score feels wrong, trust your judgment. "
      + "Sharing true positives and false positives is a useful way to help Code Buster improve.\n\n"
      + "The recipe is 100 × (actionable × 3 + advisory) / max(files, 10). "
      + "Each actionable finding counts three times, each advisory counts once, and the minimum denominator keeps tiny repositories from exploding. "
      + "A score of 100 means one weighted finding per analyzed file. Scores through 100 fit in the bowl; anything above 100 overflows.",
    style: {
      fill: COLORS.body,
      fontFamily: FONTS.sans,
      fontSize: 13,
      lineHeight: 22,
      align: "left",
      wordWrap: true,
      wordWrapWidth: 620,
    },
    anchor: { x: 0.5, y: 0 },
    eventMode: "none",
  });
  private readonly githubButton: UiButton;
  private readonly licenseButton: UiButton;
  private readonly backButton: UiButton;

  constructor(onBack: () => void, onLicenses: () => void) {
    super({ label: "info-scene", eventMode: "none", visible: false, alpha: 0 });
    this.githubButton = new UiButton({
      label: "github.com/tool-bunker/code-buster ↗",
      accessibleLabel: "Open the Code Buster repository on GitHub",
      variant: "text",
      onPress: () => {
        void openUrl(CODE_BUSTER_REPOSITORY_URL);
      },
    });
    this.licenseButton = new UiButton({
      label: "Third-party licenses",
      variant: "text",
      onPress: onLicenses,
    });
    this.backButton = new UiButton({
      label: "Back to the bowl",
      variant: "text",
      onPress: onBack,
    });
    this.addChild(
      this.background,
      this.glow,
      this.eyebrow,
      this.title,
      this.body,
      this.githubButton,
      this.licenseButton,
      this.backButton,
    );
    this.title.accessible = true;
    this.title.accessibleType = "h1";
    this.title.accessibleTitle = this.title.text;
    this.body.accessible = true;
    this.body.accessibleType = "p";
    this.body.accessibleTitle = this.body.text;
  }

  resize(width: number, height: number): void {
    const compact = width <= COMPACT_LAYOUT_MAX_WIDTH;
    const centerX = width / 2;
    const contentWidth = Math.min(width - (compact ? 36 : 64), 680);
    const top = compact ? Math.max(52, height * 0.055) : Math.max(72, height * 0.08);

    this.background.clear().rect(0, 0, width, height).fill(COLORS.background);
    this.glow.clear()
      .circle(centerX, height * 0.15, Math.min(width * 0.34, 280))
      .fill({ color: COLORS.accent, alpha: 0.035 });
    this.eyebrow.position.set(centerX, top);

    this.title.style.fontSize = compact
      ? Math.min(42, Math.max(29, width * 0.074))
      : Math.min(62, Math.max(44, width * 0.048));
    this.title.style.wordWrap = true;
    this.title.style.wordWrapWidth = contentWidth;
    this.title.position.set(centerX, top + (compact ? 42 : 55));

    this.body.style.fontSize = compact ? 12 : 13;
    this.body.style.lineHeight = compact ? 19 : 22;
    this.body.style.wordWrapWidth = Math.min(contentWidth, 620);
    const bodyTop = top + (compact ? 92 : 116);
    this.body.position.set(centerX, bodyTop);

    const githubY = bodyTop + this.body.height + 12;
    const githubWidth = Math.min(350, contentWidth);
    this.githubButton.resize(githubWidth, 30);
    this.githubButton.position.set(centerX - githubWidth / 2, githubY);

    const footerY = githubY + 42;
    const footerWidth = Math.min(190, (contentWidth - 8) / 2);
    this.licenseButton.resize(footerWidth, 28);
    this.licenseButton.position.set(centerX - footerWidth - 4, footerY);
    this.backButton.resize(footerWidth, 28);
    this.backButton.position.set(centerX + 4, footerY);
  }

  setInteractive(interactive: boolean): void {
    this.eventMode = interactive ? "passive" : "none";
  }
}


function centeredText(text: string, style: TextStyleOptions): Text {
  return new Text({ text, style, anchor: 0.5, eventMode: "none" });
}
