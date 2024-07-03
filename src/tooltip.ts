import { TFile } from 'obsidian';
import { t } from './lang/helpers';
import ReferenceList from './main';
import clip from 'text-clipper';

export class TooltipManager {
  plugin: ReferenceList;
  tooltip: HTMLDivElement;
  isHoveringTooltip = false;
  isScrollBound = false;
  boundScroll: () => void;
  previewDBTimer = 0;
  previewDBTimerClose = 0;

  constructor(plugin: ReferenceList) {
    this.plugin = plugin;
    plugin.register(() => this.hideTooltip());
  }

  findLabelsInFile(file: TFile): string[] {
    const content = app.vault.read(file);
    const labelPattern = /\\label\{(.*?)\}/g;
    const labels = [];
    let match;
    while ((match = labelPattern.exec(content)) !== null) {
      labels.push(match[1]);
    }
    return labels;
  }

  showTooltip(el: HTMLSpanElement) {
    if (this.tooltip) {
      this.hideTooltip();
    }

    if (!el.dataset.source) return;

    const file = app.vault.getAbstractFileByPath(el.dataset.source);
    if (!file || !(file instanceof TFile)) {
      return;
    }

    el.win.clearTimeout(this.previewDBTimer);
    el.win.clearTimeout(this.previewDBTimerClose);

    const labels = this.findLabelsInFile(file as TFile);
    let content: DocumentFragment | HTMLElement = null;

    if (labels.length > 0) {
      content = createFragment();
      labels.forEach((label) => {
        const labelDiv = createDiv();
        labelDiv.setText(label);
        content.append(labelDiv);
      });
    }

    const tooltip = (this.tooltip = el.doc.body.createDiv({
      cls: 'pwc-tooltip',
    }));
    const rect = el.getBoundingClientRect();

    if (rect.x === 0 && rect.y === 0) {
      return this.hideTooltip();
    }

    if (content) {
      tooltip.append(content);
    } else {
      tooltip.addClass('is-missing');
      tooltip.createEl('em', { text: 'No labels found' });
    }

    tooltip.addEventListener('pointerover', () => {
      this.isHoveringTooltip = true;
    });
    tooltip.addEventListener('pointerout', () => {
      this.isHoveringTooltip = false;
    });
    tooltip.addEventListener('click', (evt) => {
      if (evt.target instanceof HTMLElement) {
        if (
          evt.target.tagName === 'A' ||
          evt.target.classList.contains('clickable-icon')
        ) {
          this.hideTooltip();
        }
      }
    });

    el.win.setTimeout(() => {
      const viewport = el.win.visualViewport;
      const divRect = tooltip.getBoundingClientRect();

      tooltip.style.left =
        rect.x + divRect.width + 10 > viewport.width
          ? `${rect.x - (rect.x + divRect.width + 10 - viewport.width)}px`
          : `${rect.x}px`;
      tooltip.style.top =
        rect.bottom + divRect.height + 10 > viewport.height
          ? `${rect.y - divRect.height - 5}px`
          : `${rect.bottom + 5}px`;
    });

    this.isScrollBound = true;
    this.boundScroll = () => {
      if (this.isScrollBound) {
        this.hideTooltip();
      }
    };
    el.win.addEventListener('scroll', this.boundScroll, { capture: true });
  }

  hideTooltip() {
    this.isHoveringTooltip = false;
    this.isScrollBound = false;
    this.tooltip?.win.removeEventListener('scroll', this.boundScroll);
    this.tooltip?.remove();
    this.tooltip = null;
    this.boundScroll = null;
  }

  bindPreviewTooltipHandler(el: HTMLElement) {
    el.addEventListener('pointerover', (evt) => {
      evt.view.clearTimeout(this.previewDBTimer);
      evt.view.clearTimeout(this.previewDBTimerClose);
      this.previewDBTimer = evt.view.setTimeout(() => {
        this.showTooltip(el);
      }, this.plugin.settings.tooltipDelay);
    });

    el.addEventListener('pointerout', (evt) => {
      evt.view.clearTimeout(this.previewDBTimer);
      if (!this.tooltip) return;
      this.previewDBTimerClose = evt.view.setTimeout(() => {
        if (this.isHoveringTooltip) {
          this.handleTooltipHover();
        } else {
          this.hideTooltip();
        }
      }, 150);
    });
  }

  handleTooltipHover() {
    if (this.isHoveringTooltip) {
      const { tooltip } = this;
      const outhandler = (evt: PointerEvent) => {
        evt.view.clearTimeout(this.previewDBTimerClose);
        this.previewDBTimerClose = evt.view.setTimeout(() => {
          tooltip.removeEventListener('pointerout', outhandler);
          tooltip.removeEventListener('pointerenter', outhandler);
          if (this.isHoveringTooltip) {
            this.handleTooltipHover();
          } else {
            this.hideTooltip();
          }
        }, 150);
      };
      const enterHandler = (evt: PointerEvent) => {
        evt.view.clearTimeout(this.previewDBTimerClose);
      };
      tooltip.addEventListener('pointerout', outhandler);
      tooltip.addEventListener('pointerenter', enterHandler);
    }
  }

  getEditorTooltipHandler() {
    let dbOverTimer = 0;
    let dbOutTimer = 0;
    let isClosing = false;
    let activeKey: string;

    return {
      scroll: (evt: UIEvent) => {
        if (activeKey) {
          evt.view?.clearTimeout(dbOutTimer);
          evt.view?.clearTimeout(dbOverTimer);
          activeKey = null;
        }
      },
      pointerover: (evt: PointerEvent) => {
        const target = evt.target;
        if (target instanceof HTMLElement) {
          const citekey = target.dataset.citekey;
          if (citekey) {
            evt.view.clearTimeout(dbOutTimer);
            isClosing = false;
            if (citekey !== activeKey) {
              if (activeKey) {
                this.hideTooltip();
                activeKey = null;
              }
              evt.view.clearTimeout(dbOverTimer);
              dbOverTimer = evt.view.setTimeout(() => {
                this.showTooltip(target);
                activeKey = citekey;
              }, this.plugin.settings.tooltipDelay);
            }
            return;
          }
        }
        evt.view.clearTimeout(dbOverTimer);
        if (activeKey && !isClosing) {
          if (!this.tooltip) return;
          isClosing = true;
          dbOutTimer = evt.view.setTimeout(() => {
            if (this.isHoveringTooltip) {
              isClosing = false;
            } else {
              this.hideTooltip();
              activeKey = null;
              isClosing = false;
            }
          }, 150);
        }
      },
    };
  }
}
