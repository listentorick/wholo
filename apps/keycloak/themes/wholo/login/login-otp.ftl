<#-- The authenticator-app code, asked after the password when a client
     requires it (the Ops app, ADR-078). -->
<!DOCTYPE html>
<html lang="${(locale.currentLanguageTag)!'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Authenticator Code — Stocdup</title>
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
      <p class="wh-subtitle">Authenticator Code</p>
      <div class="wh-divider"></div>
    </div>

    <#if message?has_content && message.type != 'warning'>
      <p class="wh-error">${kcSanitize(message.summary)}</p>
    </#if>

    <p class="wh-body">Enter the 6-digit code from your authenticator app for ${(auth.attemptedUsername)!''}.</p>

    <form id="kc-otp-login-form" action="${url.loginAction}" method="post">

      <#-- More than one app set up: choose which one the code comes from. -->
      <#if otpLogin.userOtpCredentials?size gt 1>
        <fieldset class="wh-field">
          <legend class="wh-sr">Authenticator</legend>
          <#list otpLogin.userOtpCredentials as cred>
            <label class="wh-check">
              <input type="radio" name="selectedCredentialId" value="${cred.id}" <#if cred.id == otpLogin.selectedCredentialId>checked</#if> />
              <span>${cred.userLabel}</span>
            </label>
          </#list>
        </fieldset>
      </#if>

      <div class="wh-field wh-field--last">
        <label for="otp">Code</label>
        <input
          type="text"
          id="otp"
          name="otp"
          inputmode="numeric"
          autocomplete="one-time-code"
          placeholder="123456"
          autofocus
          <#if messagesPerField.existsError('totp')>aria-invalid="true" aria-describedby="otp-error"</#if>
        />
        <#if messagesPerField.existsError('totp')>
          <p id="otp-error" class="wh-field-error">${kcSanitize(messagesPerField.get('totp'))?no_esc}</p>
        </#if>
      </div>

      <button class="wh-btn" type="submit" name="login">
        Continue
      </button>

    </form>

    <a class="wh-link" href="${url.loginRestartFlowUrl}">Not you? Sign in again</a>

  </div>

</body>
</html>
