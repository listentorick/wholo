<#-- Setting up an authenticator app: shown on first sign-in to a client that
     requires one (the Ops app, ADR-078). The QR code and the same key as text,
     then one code from the app to prove it works. -->
<!DOCTYPE html>
<html lang="${(locale.currentLanguageTag)!'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Authenticator App — Stocdup</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="${url.resourcesPath}/css/login.css">
  <link rel="icon" href="${url.resourcesPath}/img/favicon.ico">
</head>
<body>

  <div class="wh-card">

    <div class="wh-header">
      <div class="wh-wordmark">
        <img src="${url.resourcesPath}/img/stocdup-logo-only.png" alt="" class="wh-logo" />
        <span class="wh-title">stocd<span class="wh-title-accent">up</span></span>
      </div>
      <p class="wh-subtitle">Set Up Authenticator</p>
      <div class="wh-divider"></div>
    </div>

    <#if message?has_content && message.type != 'warning'>
      <p class="wh-error">${kcSanitize(message.summary)}</p>
    </#if>

    <ol class="wh-steps">
      <li>
        Install an authenticator app on your phone, such as
        <#list totp.supportedApplications as app>${msg(app)}<#sep>, </#sep></#list>.
      </li>
      <li>
        Scan this code with the app:
        <img class="wh-qr" src="data:image/png;base64, ${totp.totpSecretQrCode}" alt="QR code for your authenticator app" />
        Or type in this key:
        <span id="kc-totp-secret-key" class="wh-secret">${totp.totpSecretEncoded}</span>
      </li>
      <li>Enter the 6-digit code the app shows.</li>
    </ol>

    <form id="kc-totp-settings-form" action="${url.loginAction}" method="post">

      <input type="hidden" id="totpSecret" name="totpSecret" value="${totp.totpSecret}" />
      <#if mode??><input type="hidden" id="mode" name="mode" value="${mode}" /></#if>

      <div class="wh-field">
        <label for="totp">Code from the app</label>
        <input
          type="text"
          id="totp"
          name="totp"
          inputmode="numeric"
          autocomplete="one-time-code"
          placeholder="123456"
          autofocus
          <#if messagesPerField.existsError('totp')>aria-invalid="true" aria-describedby="totp-error"</#if>
        />
        <#if messagesPerField.existsError('totp')>
          <p id="totp-error" class="wh-field-error">${kcSanitize(messagesPerField.get('totp'))?no_esc}</p>
        </#if>
      </div>

      <div class="wh-field wh-field--last">
        <label for="userLabel">Device name (optional)</label>
        <input
          type="text"
          id="userLabel"
          name="userLabel"
          autocomplete="off"
          placeholder="My phone"
          <#if messagesPerField.existsError('userLabel')>aria-invalid="true" aria-describedby="userLabel-error"</#if>
        />
        <#if messagesPerField.existsError('userLabel')>
          <p id="userLabel-error" class="wh-field-error">${kcSanitize(messagesPerField.get('userLabel'))?no_esc}</p>
        </#if>
      </div>

      <#-- As on the new-password page: Keycloak signs out other sessions only when this posts "on". -->
      <label class="wh-check">
        <input type="checkbox" id="logout-sessions" name="logout-sessions" value="on" checked />
        <span>${msg("logoutOtherSessions")}</span>
      </label>

      <button id="saveTOTPBtn" class="wh-btn" type="submit">
        Finish Setup
      </button>

      <#if isAppInitiatedAction??>
        <button class="wh-btn wh-btn--link" type="submit" name="cancel-aia" value="true" formnovalidate>
          Cancel
        </button>
      </#if>

    </form>

  </div>

</body>
</html>
