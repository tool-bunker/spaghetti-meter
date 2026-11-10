import { openUrl } from "@tauri-apps/plugin-opener";
import { Container, Graphics, Text, type TextStyleOptions } from "pixi.js";
import { UiButton } from "../ui/UiButton";
import { BACKGROUND_GLOWS, COLORS, FONTS } from "../ui/theme";

const BOLD_FONT_WEIGHT = "bold";
const COMPACT_LAYOUT_MAX_WIDTH = 700;

const CODE_BUSTER_REPOSITORY_URL = "https://github.com/tool-bunker/code-buster";

export class InfoScene extends Container {
  private readonly background = new Graphics();
  private readonly glow = new Graphics();
  private readonly eyebrow = centeredText("OFFICIAL PASTA SCIENCE", {
    fill: COLORS.secondary,
    fontFamily: FONTS.mono,
    fontSize: 10,
    fontWeight: BOLD_FONT_WEIGHT,
    letterSpacing: 2,
  });
  private readonly title = centeredText("Higher score. Better engineer. Probably.", {
    fill: COLORS.heading,
    fontFamily: FONTS.display,
    fontSize: 56,
    fontWeight: "700",
    letterSpacing: -1.6,
    align: "center",
  });
  private readonly body = new Text({
    text:
      "Finally, a code metric worth chasing. Spaghetti Meter turns Code Buster findings into the only number "
      + "your engineering career was missing: noodle prestige.\n\n"
      + "Higher is better. Probably. More weighted findings mean more spaghetti in the bowl and, according to extremely serious pasta science, "
      + "greater professional glory. Challenge your coworkers, impress your boss, or simply watch the bowl lose containment.\n\n"
      + "The recipe groups findings by file, rule and mode. Each group adds 100 × weight × local / max(code lines, 1000) × log2(1 + 100 × count / local). "
      + "Weight is 3 for actionable findings and 1 for advisory; local is that file’s code lines (at least 1), or the project total for non-source findings. "
      + "Repeated findings taper off; skipped files and comment-only lines do not count. String-literal content remains code. No findings means zero; otherwise the rounded score is at least 1.\n\n"
      + "This is satire, not a software quality ranking. Every repository has context, so take the result with a grain of salt. "
      + "If Code Buster labels something incorrectly, help improve it by sharing true positives and false positives.",
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
      .ellipse(width * 0.9, height * 0.12, Math.min(width * 0.42, 380), Math.min(height * 0.42, 300))
      .fill(BACKGROUND_GLOWS.primary)
      .ellipse(width * 0.08, height * 0.3, Math.min(width * 0.34, 300), Math.min(height * 0.36, 250))
      .fill(BACKGROUND_GLOWS.secondary)
      .ellipse(centerX, height * 0.96, Math.min(width * 0.4, 360), Math.min(height * 0.3, 220))
      .fill(BACKGROUND_GLOWS.accent);
    this.eyebrow.position.set(centerX, top);

    this.title.style.fontSize = compact
      ? Math.min(42, Math.max(29, width * 0.074))
      : Math.min(62, Math.max(44, width * 0.048));
    this.title.style.wordWrap = true;
    this.title.style.wordWrapWidth = contentWidth;
    const titleTop = top + (compact ? 28 : 36);
    this.title.position.set(centerX, titleTop + this.title.height / 2);

    this.body.style.fontSize = compact ? 12 : 13;
    this.body.style.lineHeight = compact ? 19 : 22;
    this.body.style.wordWrapWidth = Math.min(contentWidth, 620);
    const bodyTop = titleTop + this.title.height + (compact ? 18 : 28);
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
