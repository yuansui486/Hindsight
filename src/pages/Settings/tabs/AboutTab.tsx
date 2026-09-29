import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Info, RefreshCw, Scale, User } from "lucide-react";
import { UpdateIcon } from "../../../components/icons/UpdateIcon";
import { getVersion } from "@tauri-apps/api/app";
import { Section } from "../../../components/FormLayout/Section";
import { Row } from "../../../components/FormLayout/Row";
import { Toggle } from "../../../components/FormControls/Toggle";
import { SimplePicker } from "../../../components/SimplePicker/SimplePicker";
import { useSettings } from "../../../state/settings";
import { useUpdater } from "../../../state/updater";
import logoUrl from "../../../assets/logo.png";
import styles from "./AboutTab.module.css";

type UpdateInterval = "daily" | "weekly" | "monthly" | "onstartup";

export default function AboutTab() {
  const { t } = useTranslation();
  const [appVersion, setAppVersion] = useState<string>("");
  const { settings, update: updateSettings } = useSettings();
  const { phase, errorMsg, checkNow } = useUpdater();

  // 频率下拉选项；label 跟随当前 locale
  const intervalOptions = useMemo<{ value: UpdateInterval; label: string }[]>(
    () => [
      { value: "daily", label: t("settings.about.update.intervals.daily") },
      { value: "weekly", label: t("settings.about.update.intervals.weekly") },
      { value: "monthly", label: t("settings.about.update.intervals.monthly") },
      {
        value: "onstartup",
        label: t("settings.about.update.intervals.onstartup"),
      },
    ],
    [t],
  );

  useEffect(() => {
    void getVersion()
      .then(setAppVersion)
      .catch(() => {});
  }, []);

  if (!settings) return null;

  const checkBtnDisabled = phase === "checking" || phase === "installing";
  const statusText =
    phase === "checking"
      ? t("settings.about.update.status.checking")
      : phase === "uptodate"
        ? t("settings.about.update.status.uptodate")
        : phase === "installing"
          ? t("settings.about.update.status.installing")
          : phase === "error"
            ? t("settings.about.update.status.error", { message: errorMsg })
            : undefined;

  return (
    <>
      <div className={styles.hero}>
        <img className={styles.logo} src={logoUrl} alt="" aria-hidden draggable={false} />
        <div className={styles.heroText}>
          <div className={styles.appName}>Hindsight</div>
          <div className={styles.version}>
            {t("settings.about.subtitle", {
              version: appVersion || "0.1.0",
            })}
          </div>
        </div>
      </div>

      <Section title={t("settings.about.update.title")} icon={UpdateIcon}>
        <Row label={t("settings.about.update.currentVersionLabel")} description={statusText}>
          <span className={styles.value}>{appVersion || "—"}</span>
          <button
            type="button"
            className={styles.checkBtn}
            onClick={() => void checkNow()}
            disabled={checkBtnDisabled}
          >
            <RefreshCw
              size={13}
              strokeWidth={1.85}
              className={phase === "checking" || phase === "installing" ? styles.spinning : ""}
            />
            {phase === "checking"
              ? t("settings.about.update.checkingBtn")
              : phase === "installing"
                ? t("settings.about.update.installingBtn")
                : t("settings.about.update.checkBtn")}
          </button>
        </Row>

        <Row label={t("settings.about.update.autoLabel")}>
          <Toggle
            checked={settings.autoUpdateEnabled}
            onChange={(v) => updateSettings({ autoUpdateEnabled: v })}
          />
        </Row>

        <div
          className={`${styles.collapsible} ${
            settings.autoUpdateEnabled ? styles.collapsibleOpen : ""
          }`}
        >
          <div className={styles.collapsibleInner}>
            <Row label={t("settings.about.update.intervalLabel")}>
              <SimplePicker
                value={settings.autoUpdateInterval}
                options={intervalOptions}
                onChange={(v) =>
                  updateSettings({
                    autoUpdateInterval: v,
                  })
                }
              />
            </Row>
          </div>
        </div>
      </Section>

      <Section title={t("settings.about.info.title")} icon={Info}>
        <Row label={t("settings.about.info.authorLabel")} icon={User}>
          <span className={styles.value}>yuansui486</span>
        </Row>
        <Row label={t("settings.about.info.licenseLabel")} icon={Scale}>
          <span className={styles.value}>MIT</span>
        </Row>
      </Section>
    </>
  );
}
