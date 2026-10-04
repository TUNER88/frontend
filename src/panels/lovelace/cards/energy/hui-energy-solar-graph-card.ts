import { endOfToday, isToday, startOfToday } from "date-fns";
import type { HassConfig, UnsubscribeFunc } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import memoizeOne from "memoize-one";
import type { BarSeriesOption, LineSeriesOption } from "echarts/charts";
import type {
  CallbackDataParams,
  TopLevelFormatterParams,
} from "echarts/types/dist/shared";
import { formatNumber } from "../../../../common/number/format_number";
import "../../../../components/chart/ha-chart-base";
import "../../../../components/chart/ha-chart-tooltip-marker";
import "../../../../components/ha-card";
import type {
  EnergyData,
  EnergySolarForecasts,
  SolarSourceTypeEnergyPreference,
} from "../../../../data/energy";
import {
  getEnergyDataCollection,
  getEnergySolarForecasts,
  validateEnergyCollectionKey,
} from "../../../../data/energy";
import type { FrontendLocaleData } from "../../../../data/translation";
import { SubscribeMixin } from "../../../../mixins/subscribe-mixin";
import type { HomeAssistant } from "../../../../types";
import type { LovelaceCard } from "../../types";
import type { EnergySolarGraphCardConfig } from "../types";
import { hasConfigChanged } from "../../common/has-changed";
import { getCommonOptions } from "./common/energy-chart-options";
import { generateEnergySolarGraphData } from "./energy-solar-graph-data";
import type { HaECOption } from "../../../../resources/echarts/echarts";
import "./common/hui-energy-graph-chip";
import "../../../../components/ha-tooltip";

@customElement("hui-energy-solar-graph-card")
export class HuiEnergySolarGraphCard
  extends SubscribeMixin(LitElement)
  implements LovelaceCard
{
  public static async getConfigElement() {
    await import("../../editor/config-elements/hui-energy-graph-card-editor");
    return document.createElement("hui-energy-graph-card-editor");
  }

  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _config?: EnergySolarGraphCardConfig;

  public static getStubConfig(
    _hass: HomeAssistant,
    _entities: string[],
    _entitiesFill: string[]
  ): EnergySolarGraphCardConfig {
    return {
      type: "energy-solar-graph",
    };
  }

  @state() private _chartData: (BarSeriesOption | LineSeriesOption)[] = [];

  @state() private _yAxisFractionDigits = 1;

  @state() private _start = startOfToday();

  @state() private _end = endOfToday();

  @state() private _compareStart?: Date;

  @state() private _compareEnd?: Date;

  @state() private _total?: number;

  @state() private _totalSavings: number | null = null;

  @state() private _hasSavingsSeries = false;

  protected hassSubscribeRequiredHostProps = ["_config"];

  public hassSubscribe(): UnsubscribeFunc[] {
    return [
      getEnergyDataCollection(this.hass, {
        key: this._config?.collection_key,
      }).subscribe((data) => this._getStatistics(data)),
    ];
  }

  public getCardSize(): Promise<number> | number {
    return 3;
  }

  public setConfig(config: EnergySolarGraphCardConfig): void {
    if (config.collection_key) {
      validateEnergyCollectionKey(config.collection_key);
    }
    this._config = config;
  }

  protected shouldUpdate(changedProps: PropertyValues<this>): boolean {
    return (
      hasConfigChanged(this, changedProps) ||
      changedProps.size > 1 ||
      !changedProps.has("hass")
    );
  }

  protected render() {
    if (!this.hass || !this._config) {
      return nothing;
    }

    return html`
      <ha-card>
        ${
          this._config.title
            ? html` <div class="card-header">
                <span>${this._config.title}</span>
                <div class="chips">
                  ${
                    this._total
                      ? html`<hui-energy-graph-chip
                          .tooltip=${this._formatTotal(this._total)}
                        >
                          ${formatNumber(this._total, this.hass.locale)} kWh
                        </hui-energy-graph-chip>`
                      : nothing
                  }
                  ${
                    this._totalSavings !== null
                      ? html`<hui-energy-graph-chip
                          .tooltip=${this._formatTotalSavings(
                            this._totalSavings
                          )}
                        >
                          ${formatNumber(this._totalSavings, this.hass.locale, {
                            style: "currency",
                            currency: this.hass.config.currency!,
                          })}
                        </hui-energy-graph-chip>`
                      : nothing
                  }
                </div>
              </div>`
            : nothing
        }
        <div
          class="content ${classMap({
            "has-header": !!this._config.title,
          })}"
        >
          <ha-chart-base
            .hass=${this.hass}
            .data=${this._chartData}
            .options=${this._createOptions(
              this._start,
              this._end,
              this.hass.locale,
              this.hass.config,
              this._compareStart,
              this._compareEnd,
              this._yAxisFractionDigits,
              this._hasSavingsSeries
            )}
            chart-type="bar"
          ></ha-chart-base>
          ${
            !this._chartData.length
              ? html`<div class="no-data">
                  ${
                    isToday(this._start)
                      ? this.hass.localize(
                          "ui.panel.lovelace.cards.energy.no_data"
                        )
                      : this.hass.localize(
                          "ui.panel.lovelace.cards.energy.no_data_period"
                        )
                  }
                </div>`
              : ""
          }
        </div>
      </ha-card>
    `;
  }

  private _formatTotal = (total: number) =>
    this.hass.localize(
      "ui.panel.lovelace.cards.energy.energy_solar_graph.total_produced",
      { num: formatNumber(total, this.hass.locale) }
    );

  private _formatTotalSavings = (total: number) =>
    this.hass.localize(
      "ui.panel.lovelace.cards.energy.energy_solar_graph.total_saved",
      {
        num: formatNumber(total, this.hass.locale, {
          style: "currency",
          currency: this.hass.config.currency!,
        }),
      }
    );

  private _createOptions = memoizeOne(
    (
      start: Date,
      end: Date,
      locale: FrontendLocaleData,
      config: HassConfig,
      compareStart: Date | undefined,
      compareEnd: Date | undefined,
      yAxisFractionDigits: number,
      hasSavingsSeries: boolean
    ): HaECOption => {
      const options = getCommonOptions(
        start,
        end,
        locale,
        config,
        "kWh",
        compareStart,
        compareEnd,
        this._formatTotal,
        false,
        yAxisFractionDigits
      );

      if (!hasSavingsSeries) {
        return options;
      }

      const currency = config.currency!;
      const energyAxis = Array.isArray(options.yAxis)
        ? options.yAxis[0]
        : options.yAxis;

      options.yAxis = [
        energyAxis,
        {
          type: "value",
          name: currency,
          nameGap: 2,
          nameTextStyle: {
            align: "right",
          },
          position: "right",
          alignTicks: true,
          splitLine: {
            show: false,
          },
          axisLabel: {
            formatter: (value: number) =>
              formatNumber(value, locale, {
                style: "currency",
                currency,
                maximumFractionDigits: value === 0 ? 0 : 2,
              }),
          },
        },
      ];

      // Mixed kWh + currency series: format savings lines as currency.
      const baseFormatter = options.tooltip?.formatter;
      options.tooltip = {
        ...options.tooltip,
        formatter: (params: TopLevelFormatterParams) => {
          if (!Array.isArray(params)) {
            return typeof baseFormatter === "function"
              ? (baseFormatter as any)(params)
              : nothing;
          }
          const energyParams: CallbackDataParams[] = [];
          const savingsParams: CallbackDataParams[] = [];
          for (const param of params) {
            const id = String(param.seriesId || "");
            if (
              id.startsWith("savings-") ||
              id.startsWith("compare-savings-")
            ) {
              savingsParams.push(param);
            } else {
              energyParams.push(param);
            }
          }

          const energyTip =
            typeof baseFormatter === "function"
              ? (baseFormatter as any)(energyParams)
              : nothing;

          const savingsRows = savingsParams
            .map((param) => {
              const y = param.value?.[1] as number;
              if (y == null || y === 0) {
                return nothing;
              }
              return html`<ha-chart-tooltip-marker
                  .color=${String(param.color ?? "")}
                ></ha-chart-tooltip-marker>
                ${param.seriesName}:
                <div style="direction:ltr; display: inline;">
                  ${formatNumber(y, locale, {
                    style: "currency",
                    currency,
                  })}
                </div>`;
            })
            .filter((row) => row !== nothing);

          if (energyTip === nothing && savingsRows.length === 0) {
            return nothing;
          }
          if (savingsRows.length === 0) {
            return energyTip;
          }
          if (energyTip === nothing) {
            return html`${savingsRows.map(
              (row, i) => html`${i > 0 ? html`<br />` : nothing}${row}`
            )}`;
          }
          return html`${energyTip}<br />${savingsRows.map(
              (row, i) => html`${i > 0 ? html`<br />` : nothing}${row}`
            )}`;
        },
      };

      return options;
    }
  );

  private async _getStatistics(energyData: EnergyData): Promise<void> {
    const solarSources: SolarSourceTypeEnergyPreference[] =
      energyData.prefs.energy_sources.filter(
        (source) => source.type === "solar"
      ) as SolarSourceTypeEnergyPreference[];

    let forecasts: EnergySolarForecasts | undefined;
    if (
      solarSources.some((source) => source.config_entry_solar_forecast?.length)
    ) {
      try {
        forecasts = await getEnergySolarForecasts(this.hass);
      } catch (_e) {
        // ignore
      }
    }

    const result = generateEnergySolarGraphData({
      hass: this.hass,
      energyData,
      forecasts,
      computedStyles: getComputedStyle(this),
      now: endOfToday(),
    });

    this._start = result.start;
    this._end = result.end;
    this._compareStart = result.compareStart;
    this._compareEnd = result.compareEnd;
    this._yAxisFractionDigits = result.yAxisFractionDigits;
    this._chartData = result.chartData;
    this._total = result.total;
    this._totalSavings = result.totalSavings;
    this._hasSavingsSeries = result.hasSavingsSeries;
  }

  static styles = css`
    ha-card {
      height: 100%;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 0;
    }
    .chips {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .content {
      padding: 16px;
    }
    .has-header {
      padding-top: 0;
    }
    .no-data {
      position: absolute;
      height: 100%;
      top: 0;
      left: 0;
      right: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20%;
      margin-left: 32px;
      margin-inline-start: 32px;
      margin-inline-end: initial;
      box-sizing: border-box;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-energy-solar-graph-card": HuiEnergySolarGraphCard;
  }
}
