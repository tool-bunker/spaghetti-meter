import { Container, Graphics, Text, type TextStyleOptions } from "pixi.js";
import { UiButton } from "../ui/UiButton";
import { COLORS, FONTS } from "../ui/theme";

const BOLD_FONT_WEIGHT = "bold";
const COMPACT_LAYOUT_MAX_WIDTH = 700;

interface StepContent {
  number: string;
  title: string;
  copy: string;
}

export class InfoScene extends Container {
  private readonly background = new Graphics();
  private readonly glow = new Graphics();
  private readonly eyebrow = centeredText("BEHIND THE BOWL", {
    fill: COLORS.red,
    fontFamily: FONTS.mono,
    fontSize: 10,
    fontWeight: BOLD_FONT_WEIGHT,
    letterSpacing: 2,
  });
  private readonly title = centeredText("How Spagetti works", {
    fill: COLORS.heading,
    fontFamily: FONTS.serif,
    fontSize: 56,
    fontWeight: "500",
    letterSpacing: -2,
    align: "center",
  });
  private readonly lede = centeredText(
    "Spagetti runs the bundled Code Buster engine on the folder you choose.\nEverything stays on this computer.",
    {
      fill: 0x9c9084,
      fontFamily: FONTS.sans,
      fontSize: 14,
      lineHeight: 23,
      align: "center",
      wordWrap: true,
      wordWrapWidth: 560,
    },
  );
  private readonly steps = [
    new StepCard({
      number: "01",
      title: "Choose a project",
      copy: "Only supported source files are analyzed.",
    }),
    new StepCard({
      number: "02",
      title: "Weigh the findings",
      copy: "Actionable findings count as three; advisories count as one.",
    }),
    new StepCard({
      number: "03",
      title: "Serve the bowl",
      copy: "The score controls the serving. One hundred fills the bowl.",
    }),
  ];
  private readonly formula = new FormulaCard();
  private readonly backButton: UiButton;

  constructor(onBack: () => void) {
    super({ label: "info-scene", eventMode: "none", visible: false, alpha: 0 });
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
      this.lede,
      ...this.steps,
      this.formula,
      this.backButton,
    );
    this.title.accessible = true;
    this.title.accessibleType = "h1";
    this.title.accessibleTitle = "How Spagetti works";
    this.lede.accessible = true;
    this.lede.accessibleType = "p";
    this.lede.accessibleTitle = this.lede.text;
  }

  resize(width: number, height: number): void {
    const compact = width <= COMPACT_LAYOUT_MAX_WIDTH;
    const centerX = width / 2;
    const contentWidth = Math.min(width - (compact ? 36 : 64), 680);

    this.background.clear().rect(0, 0, width, height).fill(COLORS.background);
    this.glow.clear()
      .circle(centerX, height * 0.15, Math.min(width * 0.34, 280))
      .fill({ color: COLORS.accent, alpha: 0.035 });

    if (compact) {
      const top = Math.max(58, height * 0.065);
      this.eyebrow.position.set(centerX, top);
      this.title.style.fontSize = Math.min(48, Math.max(32, width * 0.085));
      this.title.style.wordWrap = true;
      this.title.style.wordWrapWidth = contentWidth;
      this.title.position.set(centerX, top + 46);
      this.lede.style.fontSize = 13;
      this.lede.style.wordWrapWidth = contentWidth;
      this.lede.position.set(centerX, top + 116);

      const cardWidth = contentWidth;
      const cardHeight = Math.max(78, Math.min(94, (height - 440) / 3));
      const cardStart = top + 190;
      for (let index = 0; index < this.steps.length; index += 1) {
        const step = this.steps[index];
        step.resize(cardWidth, cardHeight, true);
        step.position.set(centerX - cardWidth / 2, cardStart + index * (cardHeight + 8));
      }

      const formulaY = cardStart + this.steps.length * (cardHeight + 8) + 4;
      this.formula.resize(contentWidth, 98);
      this.formula.position.set(centerX - contentWidth / 2, formulaY);
      this.backButton.resize(Math.min(190, contentWidth), 28);
      this.backButton.position.set(centerX - this.backButton.width / 2, formulaY + 108);
    } else {
      const top = Math.max(90, height * 0.14);
      this.eyebrow.position.set(centerX, top);
      this.title.style.fontSize = Math.min(72, Math.max(48, width * 0.052));
      this.title.style.wordWrapWidth = contentWidth;
      this.title.position.set(centerX, top + 62);
      this.lede.style.fontSize = 14;
      this.lede.style.wordWrapWidth = 560;
      this.lede.position.set(centerX, top + 145);

      const gap = 12;
      const cardWidth = (contentWidth - gap * 2) / 3;
      const cardHeight = 138;
      const cardY = top + 210;
      for (let index = 0; index < this.steps.length; index += 1) {
        const step = this.steps[index];
        step.resize(cardWidth, cardHeight, false);
        step.position.set(centerX - contentWidth / 2 + index * (cardWidth + gap), cardY);
      }

      this.formula.resize(contentWidth, 94);
      this.formula.position.set(centerX - contentWidth / 2, cardY + cardHeight + 12);
      this.backButton.resize(190, 28);
      this.backButton.position.set(centerX - 95, cardY + cardHeight + 116);
    }
  }

  setInteractive(interactive: boolean): void {
    this.eventMode = interactive ? "passive" : "none";
  }
}

class StepCard extends Container {
  private readonly panel = new Graphics();
  private readonly numberText: Text;
  private readonly titleText: Text;
  private readonly copyText: Text;

  constructor(content: StepContent) {
    super({ eventMode: "none" });
    this.numberText = new Text({
      text: content.number,
      style: { fill: COLORS.red, fontFamily: FONTS.mono, fontSize: 10 },
    });
    this.titleText = new Text({
      text: content.title,
      style: { fill: COLORS.project, fontFamily: FONTS.serif, fontSize: 16, fontWeight: "500" },
    });
    this.copyText = new Text({
      text: content.copy,
      style: {
        fill: COLORS.muted,
        fontFamily: FONTS.sans,
        fontSize: 11,
        lineHeight: 16,
        wordWrap: true,
      },
    });
    this.addChild(this.panel, this.numberText, this.titleText, this.copyText);
    this.accessible = true;
    this.accessibleType = "section";
    this.accessibleTitle = `${content.number}. ${content.title}. ${content.copy}`;
  }

  resize(width: number, height: number, compact: boolean): void {
    this.panel.clear()
      .rect(0, 0, width, height)
      .fill({ color: 0xffffff, alpha: 0.025 })
      .stroke({ color: COLORS.text, alpha: 0.11, width: 1 });
    const padding = 16;
    this.numberText.position.set(padding, compact ? 14 : 16);
    this.titleText.position.set(compact ? 52 : padding, compact ? 12 : 49);
    this.copyText.style.wordWrapWidth = compact ? width - 68 : width - padding * 2;
    this.copyText.position.set(compact ? 52 : padding, compact ? 36 : 77);
  }
}

class FormulaCard extends Container {
  private readonly panel = new Graphics();
  private readonly eyebrow = centeredText("THE RECIPE", {
    fill: COLORS.red,
    fontFamily: FONTS.mono,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
  });
  private readonly formula = centeredText(
    "100 × (actionable × 3 + advisory) ÷ max(files, 10)",
    {
      fill: COLORS.accent,
      fontFamily: FONTS.mono,
      fontSize: 12,
      fontWeight: "600",
      align: "center",
      wordWrap: true,
    },
  );
  private readonly copy = centeredText(
    "Scores through 100 fit in the bowl. Anything above 100 overflows.",
    {
      fill: COLORS.muted,
      fontFamily: FONTS.sans,
      fontSize: 11,
      align: "center",
      wordWrap: true,
    },
  );

  constructor() {
    super({ eventMode: "none" });
    this.addChild(this.panel, this.eyebrow, this.formula, this.copy);
    this.accessible = true;
    this.accessibleType = "section";
    this.accessibleTitle = "The recipe. 100 times actionable times 3 plus advisory, divided by the greater of files or 10. Scores through 100 fit in the bowl. Anything above 100 overflows.";
  }

  resize(width: number, height: number): void {
    this.panel.clear()
      .rect(0, 0, width, height)
      .fill({ color: COLORS.accent, alpha: 0.025 })
      .stroke({ color: COLORS.accent, alpha: 0.18, width: 1 });
    this.eyebrow.position.set(width / 2, 18);
    this.formula.style.wordWrapWidth = width - 24;
    this.formula.position.set(width / 2, 45);
    this.copy.style.wordWrapWidth = width - 24;
    this.copy.position.set(width / 2, height - 20);
  }
}

function centeredText(text: string, style: TextStyleOptions): Text {
  return new Text({ text, style, anchor: 0.5, eventMode: "none" });
}
