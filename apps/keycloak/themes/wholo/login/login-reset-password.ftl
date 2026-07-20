<!DOCTYPE html>
<html lang="${(locale.currentLanguageTag)!'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Reset Password — Stocdup</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="${url.resourcesPath}/css/login.css">
</head>
<body>

  <div class="wh-card">

    <div class="wh-header">
      <div class="wh-wordmark">
        <img src="${url.resourcesPath}/img/stocdup-logo-only.png" alt="" class="wh-logo" />
        <span class="wh-title">stocd<span class="wh-title-accent">up</span></span>
      </div>
      <p class="wh-subtitle">Reset Password</p>
      <div class="wh-divider"></div>
    </div>

    <#if message?has_content>
      <#if message.type == 'success'>
        <p class="wh-info">${kcSanitize(message.summary)}</p>
      <#else>
        <p class="wh-error">${kcSanitize(message.summary)}</p>
      </#if>
    </#if>

    <#if message?has_content && message.type == 'success'>
      <a class="wh-link" href="${url.loginUrl}">Back to Sign In</a>
    <#else>
      <form id="kc-reset-password-form" action="${url.loginAction}" method="post">

        <div class="wh-field wh-field--last">
          <label for="username">
            <#if !realm.loginWithEmailAllowed>Username<#elseif !realm.registrationEmailAsUsername>Username or Email<#else>Email</#if>
          </label>
          <input
            type="<#if realm.loginWithEmailAllowed && realm.registrationEmailAsUsername>email<#else>text</#if>"
            id="username"
            name="username"
            value="${(auth.attemptedUsername)!''}"
            autocomplete="email"
            placeholder="you@example.com"
            autofocus
          />
        </div>

        <button class="wh-btn" type="submit">
          Send Reset Link
        </button>

      </form>

      <a class="wh-link" href="${url.loginUrl}">Back to Sign In</a>
    </#if>

  </div>

</body>
</html>
