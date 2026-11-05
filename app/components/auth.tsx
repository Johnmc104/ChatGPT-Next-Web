import styles from "./auth.module.scss";
import { IconButton } from "./button";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Path } from "../constant";
import { useAccessStore } from "../store";
import Locale from "../locales";
import BotIcon from "../icons/bot.svg";
import { getClientConfig } from "../config/client";
import { PasswordInput } from "./ui-lib";
import LeftIcon from "@/app/icons/left.svg";
import clsx from "clsx";
import { resolveAuthorization } from "@/app/domain/auth/authorization";

export function AuthPage() {
  const navigate = useNavigate();
  const accessStore = useAccessStore();
  const [error, setError] = useState("");
  const loadingConfig =
    accessStore.configStatus === "idle" ||
    accessStore.configStatus === "loading";

  useEffect(() => {
    accessStore.fetchConfig().catch(() => {
      setError(Locale.Auth.ConfigError);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goChat = async () => {
    // Clear any previous error
    setError("");

    if (accessStore.configStatus !== "ready") {
      try {
        await accessStore.fetchConfig();
      } catch {
        setError(Locale.Auth.ConfigError);
        return;
      }
    }

    const state = useAccessStore.getState();

    // Check if user has provided their own API key (unified proxy: only openaiApiKey matters)
    const hasUserKey = state.isValidOpenAI();

    // Check if server has API key and user provided access code (if needed)
    const hasServerKey = state.hasServerApiKey;
    const needCode = state.needCode;
    const hasAccessCode = state.accessCode.trim().length > 0;

    const decision = resolveAuthorization({
      hasUserKey,
      hasServerKey,
      needCode,
      hasAccessCode,
    });
    switch (decision.status) {
      case "authorized":
        navigate(Path.Chat);
        break;
      case "missing-access-code":
        setError(Locale.Auth.MissingCode);
        break;
      case "missing-server-key":
        setError(Locale.Auth.MissingServerKey);
        break;
    }
  };

  useEffect(() => {
    if (getClientConfig()?.isApp) {
      navigate(Path.Settings);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles["auth-page"]}>
      <div className={styles["auth-header"]}>
        <IconButton
          icon={<LeftIcon />}
          text={Locale.Auth.Return}
          onClick={() => navigate(Path.Home)}
        ></IconButton>
      </div>
      <div className={clsx("no-dark", styles["auth-logo"])}>
        <BotIcon />
      </div>

      <div className={styles["auth-title"]}>{Locale.Auth.Title}</div>
      <div className={styles["auth-tips"]}>{Locale.Auth.Tips}</div>

      <PasswordInput
        style={{ marginTop: "3vh", marginBottom: "3vh" }}
        aria={Locale.Settings.ShowPassword}
        aria-label={Locale.Auth.Input}
        value={accessStore.accessCode}
        type="text"
        placeholder={Locale.Auth.Input}
        onChange={(e) => {
          accessStore.update(
            (access) => (access.accessCode = e.currentTarget.value),
          );
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") void goChat();
        }}
        disabled={loadingConfig}
      />

      {!accessStore.hideUserApiKey ? (
        <>
          <div className={styles["auth-tips"]}>{Locale.Auth.SubTips}</div>
          <PasswordInput
            style={{ marginTop: "3vh", marginBottom: "3vh" }}
            aria={Locale.Settings.ShowPassword}
            aria-label={Locale.Settings.Access.OpenAI.ApiKey.Placeholder}
            value={accessStore.openaiApiKey}
            type="text"
            placeholder={Locale.Settings.Access.OpenAI.ApiKey.Placeholder}
            onChange={(e) => {
              accessStore.update(
                (access) => (access.openaiApiKey = e.currentTarget.value),
              );
            }}
            disabled={loadingConfig}
          />
        </>
      ) : null}

      {loadingConfig && (
        <div className={styles["auth-status"]}>{Locale.Auth.Loading}</div>
      )}

      {error && (
        <div className={styles["auth-error"]} role="alert">
          {error}
        </div>
      )}

      <div className={styles["auth-actions"]}>
        <IconButton
          text={Locale.Auth.Confirm}
          type="primary"
          onClick={goChat}
          disabled={loadingConfig}
        />
      </div>
    </div>
  );
}
