import { mdiPlus } from "@mdi/js";
import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import type { HASSDomCurrentTargetEvent } from "../../../../common/dom/fire_event";
import "../../../../components/entity/ha-entity-picker";
import "../../../../components/entity/ha-statistic-picker";
import "../../../../components/ha-button";
import "../../../../components/ha-checkbox";
import type { HaCheckbox } from "../../../../components/ha-checkbox";
import "../../../../components/ha-dialog";
import "../../../../components/ha-dialog-footer";
import "../../../../components/ha-svg-icon";
import "../../../../components/radio/ha-radio-group";
import "../../../../components/input/ha-input";
import { domainToName } from "../../../../data/integration";
import type { HaRadioGroup } from "../../../../components/radio/ha-radio-group";
import "../../../../components/radio/ha-radio-option";
import type { ConfigEntry } from "../../../../data/config_entries";
import { getConfigEntries } from "../../../../data/config_entries";
import type { SolarSourceTypeEnergyPreference } from "../../../../data/energy";
import {
  emptySolarEnergyPreference,
  energyStatisticHelpUrl,
} from "../../../../data/energy";
import { getSensorDeviceClassConvertibleUnits } from "../../../../data/sensor";
import { showConfigFlowDialog } from "../../../../dialogs/config-flow/show-dialog-config-flow";
import type { HassDialog } from "../../../../dialogs/make-dialog-manager";
import { DirtyStateProviderMixin } from "../../../../mixins/dirty-state-provider-mixin";
import { haStyle, haStyleDialog } from "../../../../resources/styles";
import type { HomeAssistant, ValueChangedEvent } from "../../../../types";
import { brandsUrl } from "../../../../util/brands-url";
import type { EnergySettingsSolarDialogParams } from "./show-dialogs-energy";
import {
  getStatisticLabel,
  getStatisticMetadata,
  isExternalStatistic,
} from "../../../../data/recorder";
import type { HaInput } from "../../../../components/input/ha-input";

type SavingsType = "no_cost" | "stat" | "entity" | "number";

interface SolarFormState {
  source: SolarSourceTypeEnergyPreference;
  forecast: boolean;
  savingsType: SavingsType;
}

const savingsTypeFromSource = (
  source: SolarSourceTypeEnergyPreference
): SavingsType => {
  if (source.stat_cost) {
    return "stat";
  }
  if (source.entity_energy_price) {
    return "entity";
  }
  if (
    source.number_energy_price !== null &&
    source.number_energy_price !== undefined
  ) {
    return "number";
  }
  return "no_cost";
};

const energyUnitClasses = ["energy"];
const powerUnitClasses = ["power"];

@customElement("dialog-energy-solar-settings")
export class DialogEnergySolarSettings
  extends DirtyStateProviderMixin<SolarFormState>()(LitElement)
  implements HassDialog<EnergySettingsSolarDialogParams>
{
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _params?: EnergySettingsSolarDialogParams;

  @state() private _open = false;

  @state() private _source?: SolarSourceTypeEnergyPreference;

  @state() private _configEntries?: ConfigEntry[];

  @state() private _forecast?: boolean;

  @state() private _savingsType: SavingsType = "no_cost";

  @state() private _energy_units?: string[];

  @state() private _power_units?: string[];

  @state() private _error?: string;

  private _excludeList?: string[];

  private _excludeListPower?: string[];

  public async showDialog(
    params: EnergySettingsSolarDialogParams
  ): Promise<void> {
    this._params = params;
    this._fetchSolarForecastConfigEntries();
    this._source = params.source
      ? { ...params.source }
      : emptySolarEnergyPreference();
    this._forecast = this._source.config_entry_solar_forecast !== null;
    this._savingsType = savingsTypeFromSource(this._source);
    this._energy_units = (
      await getSensorDeviceClassConvertibleUnits(this.hass, "energy")
    ).units;
    this._power_units = (
      await getSensorDeviceClassConvertibleUnits(this.hass, "power")
    ).units;
    this._excludeList = this._params.solar_sources
      .map((entry) => entry.stat_energy_from)
      .filter((id) => id !== this._source?.stat_energy_from);
    this._excludeListPower = this._params.solar_sources
      .map((entry) => entry.stat_rate)
      .filter((id) => id && id !== this._source?.stat_rate) as string[];

    this._open = true;
    this._initDirtyTracking(
      { type: "deep" },
      {
        source: this._source!,
        forecast: this._forecast!,
        savingsType: this._savingsType,
      }
    );
  }

  public closeDialog() {
    this._open = false;
    return true;
  }

  private _dialogClosed() {
    this._params = undefined;
    this._source = undefined;
    this._forecast = undefined;
    this._savingsType = "no_cost";
    this._error = undefined;
    this._excludeList = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  protected render() {
    if (!this._params || !this._source) {
      return nothing;
    }

    // External statistics cannot use an entity or a fixed price.
    const externalSolarSource =
      !!this._source.stat_energy_from &&
      isExternalStatistic(this._source.stat_energy_from);

    return html`
      <ha-dialog
        .open=${this._open}
        header-title=${this.hass.localize(
          "ui.panel.config.energy.solar.dialog.header"
        )}
        .preventScrimClose=${this.isDirtyState}
        @closed=${this._dialogClosed}
      >
        ${this._error ? html`<p class="error">${this._error}</p>` : ""}

        <ha-statistic-picker
          .hass=${this.hass}
          .helpMissingEntityUrl=${energyStatisticHelpUrl}
          .includeUnitClass=${energyUnitClasses}
          .value=${this._source.stat_energy_from}
          .label=${this.hass.localize(
            "ui.panel.config.energy.solar.dialog.solar_production_energy"
          )}
          .excludeStatistics=${this._excludeList}
          @value-changed=${this._statisticChanged}
          .helper=${this.hass.localize(
            "ui.panel.config.energy.solar.dialog.entity_para",
            { unit: this._energy_units?.join(", ") || "" }
          )}
          autofocus
        ></ha-statistic-picker>

        <ha-input
          .label=${this.hass.localize(
            "ui.panel.config.energy.solar.dialog.display_name"
          )}
          type="text"
          .disabled=${!this._source?.stat_energy_from}
          .value=${this._source?.name || ""}
          .placeholder=${
            this._source?.stat_energy_from
              ? getStatisticLabel(
                  this.hass,
                  this._source.stat_energy_from,
                  this._params?.statsMetadata?.[this._source.stat_energy_from]
                )
              : ""
          }
          @input=${this._nameChanged}
        >
        </ha-input>

        <ha-statistic-picker
          .hass=${this.hass}
          .includeUnitClass=${powerUnitClasses}
          .value=${this._source.stat_rate}
          .label=${this.hass.localize(
            "ui.panel.config.energy.solar.dialog.solar_production_power"
          )}
          .excludeStatistics=${this._excludeListPower}
          @value-changed=${this._powerStatisticChanged}
          .helper=${this.hass.localize(
            "ui.panel.config.energy.solar.dialog.entity_para",
            { unit: this._power_units?.join(", ") || "" }
          )}
        ></ha-statistic-picker>

        <h3>
          ${this.hass.localize(
            "ui.panel.config.energy.solar.dialog.solar_production_forecast"
          )}
        </h3>
        <p>
          ${this.hass.localize(
            "ui.panel.config.energy.solar.dialog.solar_production_forecast_description"
          )}
        </p>

        <ha-radio-group
          .value=${this._forecast ? "true" : "false"}
          name="forecast"
          @change=${this._handleForecastChanged}
        >
          <ha-radio-option value="false">
            ${this.hass.localize(
              "ui.panel.config.energy.solar.dialog.dont_forecast_production"
            )}
          </ha-radio-option>
          <ha-radio-option value="true">
            ${this.hass.localize(
              "ui.panel.config.energy.solar.dialog.forecast_production"
            )}
          </ha-radio-option>
        </ha-radio-group>
        ${
          this._forecast
            ? html`<div class="forecast-options">
                ${this._configEntries?.map(
                  (entry) =>
                    html`<ha-checkbox
                      .entry=${entry}
                      @change=${this._forecastCheckChanged}
                      .checked=${!!this._source?.config_entry_solar_forecast?.includes(
                        entry.entry_id
                      )}
                    >
                      <div style="display: flex; align-items: center;">
                        <img
                          alt=""
                          crossorigin="anonymous"
                          referrerpolicy="no-referrer"
                          style="height: 24px; margin-right: 16px; margin-inline-end: 16px; margin-inline-start: initial;"
                          src=${brandsUrl(
                            {
                              domain: entry.domain,
                              type: "icon",
                              darkOptimized: this.hass.themes?.darkMode,
                            },
                            this.hass.auth.data.hassUrl
                          )}
                        />${entry.title || domainToName(this.hass.localize, entry.domain)}
                      </div>
                    </ha-checkbox>`
                )}
                <ha-button
                  appearance="filled"
                  size="s"
                  @click=${this._addForecast}
                >
                  <ha-svg-icon .path=${mdiPlus} slot="start"></ha-svg-icon>
                  ${this.hass.localize(
                    "ui.panel.config.energy.solar.dialog.add_forecast"
                  )}
                </ha-button>
              </div>`
            : ""
        }

        <p class="section-label">
          ${this.hass.localize("ui.panel.config.energy.solar.dialog.savings")}
        </p>
        <p class="section-description">
          ${this.hass.localize(
            "ui.panel.config.energy.solar.dialog.savings_para"
          )}
        </p>

        <ha-radio-group
          .value=${this._savingsType}
          name="savingsType"
          @change=${this._handleSavingsTypeChanged}
        >
          <ha-radio-option value="no_cost">
            ${this.hass.localize(
              "ui.panel.config.energy.solar.dialog.no_savings_tracking"
            )}
          </ha-radio-option>
          <ha-radio-option value="stat">
            ${this.hass.localize(
              "ui.panel.config.energy.solar.dialog.savings_stat"
            )}
          </ha-radio-option>
          <ha-radio-option value="entity" .disabled=${externalSolarSource}>
            ${this.hass.localize(
              "ui.panel.config.energy.solar.dialog.savings_entity"
            )}
          </ha-radio-option>
          <ha-radio-option value="number" .disabled=${externalSolarSource}>
            ${this.hass.localize(
              "ui.panel.config.energy.solar.dialog.savings_number"
            )}
          </ha-radio-option>
        </ha-radio-group>
        ${
          this._savingsType === "stat"
            ? html`
                <ha-statistic-picker
                  .hass=${this.hass}
                  .value=${this._source.stat_cost}
                  .label=${this.hass.localize(
                    "ui.panel.config.energy.solar.dialog.savings_stat_label"
                  )}
                  @value-changed=${this._statSavingsChanged}
                ></ha-statistic-picker>
              `
            : nothing
        }
        ${
          this._savingsType === "entity"
            ? html`
                <ha-entity-picker
                  .value=${this._source.entity_energy_price}
                  .label=${this.hass.localize(
                    "ui.panel.config.energy.solar.dialog.savings_entity_label"
                  )}
                  include-domains='["sensor", "input_number"]'
                  @value-changed=${this._entitySavingsChanged}
                ></ha-entity-picker>
              `
            : nothing
        }
        ${
          this._savingsType === "number"
            ? html`
                <ha-input
                  .value=${
                    this._source.number_energy_price !== null &&
                    this._source.number_energy_price !== undefined
                      ? String(this._source.number_energy_price)
                      : ""
                  }
                  .label=${this.hass.localize(
                    "ui.panel.config.energy.solar.dialog.savings_number_label"
                  )}
                  type="number"
                  step="any"
                  @input=${this._numberSavingsChanged}
                >
                  <span slot="end">${this.hass.config.currency}/kWh</span>
                </ha-input>
              `
            : nothing
        }

        <ha-dialog-footer slot="footer">
          <ha-button
            appearance="plain"
            @click=${this.closeDialog}
            slot="secondaryAction"
          >
            ${this.hass.localize("ui.common.cancel")}
          </ha-button>
          <ha-button
            @click=${this._save}
            .disabled=${
              !this._source!.stat_energy_from ||
              (!!this._params?.source && !this.isDirtyState)
            }
            slot="primaryAction"
          >
            ${this.hass.localize("ui.common.save")}
          </ha-button>
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  private async _fetchSolarForecastConfigEntries() {
    const domains = this._params!.info.solar_forecast_domains;
    this._configEntries =
      domains.length === 0
        ? []
        : domains.length === 1
          ? await getConfigEntries(this.hass, {
              type: ["service"],
              domain: domains[0],
            })
          : (await getConfigEntries(this.hass, { type: ["service"] })).filter(
              (entry) => domains.includes(entry.domain)
            );
  }

  private _handleForecastChanged(ev: HASSDomCurrentTargetEvent<HaRadioGroup>) {
    this._forecast = (ev.currentTarget as HaRadioGroup).value === "true";
    this._updateFormDirtyState();
  }

  private _forecastCheckChanged(ev) {
    const input = ev.currentTarget as HaCheckbox;
    const entry = (input as any).entry as ConfigEntry;
    const checked = input.checked;
    const list = this._source!.config_entry_solar_forecast
      ? [...this._source!.config_entry_solar_forecast]
      : [];
    if (checked) {
      list.push(entry.entry_id);
    } else {
      list.splice(list.indexOf(entry.entry_id), 1);
    }
    this._source = { ...this._source!, config_entry_solar_forecast: list };
    this._updateFormDirtyState();
  }

  private _addForecast() {
    showConfigFlowDialog(this, {
      startFlowHandler: "forecast_solar",
      dialogClosedCallback: (params) => {
        if (params.entryId) {
          const list = this._source!.config_entry_solar_forecast
            ? [...this._source!.config_entry_solar_forecast]
            : [];
          list.push(params.entryId);
          this._source = {
            ...this._source!,
            config_entry_solar_forecast: list,
          };
          this._fetchSolarForecastConfigEntries();
          this._updateFormDirtyState();
        }
      },
    });
  }

  private async _statisticChanged(ev: ValueChangedEvent<string>) {
    this._source = { ...this._source!, stat_energy_from: ev.detail.value };
    if (
      ev.detail.value &&
      isExternalStatistic(ev.detail.value) &&
      (this._savingsType === "entity" || this._savingsType === "number")
    ) {
      this._savingsType = "no_cost";
      this._source = {
        ...this._source!,
        entity_energy_price: null,
        number_energy_price: null,
      };
    }
    if (
      ev.detail.value &&
      isExternalStatistic(ev.detail.value) &&
      this._params?.statsMetadata &&
      !(ev.detail.value in this._params.statsMetadata)
    ) {
      const [metadata] = await getStatisticMetadata(this.hass, [
        ev.detail.value,
      ]);
      if (metadata) {
        this._params.statsMetadata[ev.detail.value] = metadata;
        this.requestUpdate("_params");
      }
    }
    this._updateFormDirtyState();
  }

  private _powerStatisticChanged(ev: ValueChangedEvent<string>) {
    this._source = { ...this._source!, stat_rate: ev.detail.value };
    this._updateFormDirtyState();
  }

  private _nameChanged(ev: InputEvent) {
    this._source = {
      ...this._source!,
      name: (ev.target as HaInput).value,
    };
    if (!this._source.name) {
      delete this._source.name;
    }
    this._updateFormDirtyState();
  }

  private _handleSavingsTypeChanged(
    ev: HASSDomCurrentTargetEvent<HaRadioGroup>
  ) {
    this._savingsType = (ev.currentTarget as HaRadioGroup).value as SavingsType;
    this._source = {
      ...this._source!,
      stat_cost: null,
      entity_energy_price: null,
      number_energy_price: null,
    };
    this._updateFormDirtyState();
  }

  private _statSavingsChanged(ev: ValueChangedEvent<string>) {
    this._source = { ...this._source!, stat_cost: ev.detail.value || null };
    this._updateFormDirtyState();
  }

  private _entitySavingsChanged(ev: ValueChangedEvent<string>) {
    this._source = {
      ...this._source!,
      entity_energy_price: ev.detail.value || null,
    };
    this._updateFormDirtyState();
  }

  private _numberSavingsChanged(ev: HASSDomCurrentTargetEvent<HaInput>) {
    const value = ev.currentTarget.value
      ? parseFloat(ev.currentTarget.value)
      : null;
    this._source = { ...this._source!, number_energy_price: value };
    this._updateFormDirtyState();
  }

  private _updateFormDirtyState(): void {
    this._updateDirtyState({
      source: this._source!,
      forecast: this._forecast!,
      savingsType: this._savingsType,
    });
  }

  private async _save() {
    try {
      if (!this._forecast) {
        this._source!.config_entry_solar_forecast = null;
      }
      const source: SolarSourceTypeEnergyPreference = { ...this._source! };
      if (this._savingsType === "no_cost") {
        // Today's core solar schema rejects these keys. Omit them unless
        // the user actually turned savings tracking on.
        delete source.stat_cost;
        delete source.entity_energy_price;
        delete source.number_energy_price;
      } else {
        source.stat_cost = source.stat_cost ?? null;
        source.entity_energy_price = source.entity_energy_price ?? null;
        source.number_energy_price =
          source.number_energy_price === undefined
            ? null
            : source.number_energy_price;
      }
      await this._params!.saveCallback(source);
      this._markDirtyStateClean();
      this.closeDialog();
    } catch (err: any) {
      this._error = err.message;
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      haStyleDialog,
      css`
        ha-statistic-picker,
        ha-entity-picker {
          display: block;
          margin-bottom: var(--ha-space-4);
        }
        ha-input {
          margin-bottom: var(--ha-space-4);
          --ha-input-padding-bottom: 0;
        }
        img {
          height: 24px;
          margin-right: 16px;
          margin-inline-end: 16px;
          margin-inline-start: initial;
        }
        ha-statistic-picker {
          width: 100%;
        }
        ha-radio-group {
          margin-bottom: var(--ha-space-3);
        }
        .section-label {
          margin-top: var(--ha-space-4);
          margin-bottom: var(--ha-space-2);
        }
        .section-description {
          margin-top: 0;
          margin-bottom: var(--ha-space-2);
          color: var(--secondary-text-color);
          font-size: 0.875em;
        }
        .forecast-options {
          display: flex;
          flex-direction: column;
          min-width: 0;
          gap: var(--ha-space-2);
          margin-inline-start: var(--ha-space-3);
        }
        .forecast-options ha-button {
          margin-top: var(--ha-space-4);
          width: fit-content;
        }
        .forecast-options ha-checkbox {
          justify-content: center;
          min-height: 40px;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-energy-solar-settings": DialogEnergySolarSettings;
  }
}
