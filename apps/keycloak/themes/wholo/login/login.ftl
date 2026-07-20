<!DOCTYPE html>
<html lang="${(locale.currentLanguageTag)!'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Sign In — Stocdup</title>
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
      <p class="wh-subtitle">Sign In</p>
      <div class="wh-divider"></div>
    </div>

    <#if message?has_content>
      <p class="wh-error">${kcSanitize(message.summary)}</p>
    </#if>

    <form id="kc-form-login" action="${url.loginAction}" method="post">

      <div class="wh-field">
        <label for="username">Email</label>
        <input
          type="email"
          id="username"
          name="username"
          value="${(login.username)!''}"
          autocomplete="email"
          placeholder="you@example.com"
          autofocus
        />
      </div>

      <div class="wh-field wh-field--last">
        <label for="password">Password</label>
        <input
          type="password"
          id="password"
          name="password"
          autocomplete="current-password"
          placeholder="••••••••"
        />
      </div>

      <input
        type="hidden"
        id="id-hidden-input"
        name="credentialId"
        <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if>
      />

      <button class="wh-btn" type="submit" name="login">
        Log In
      </button>

    </form>

    <#if realm.resetPasswordAllowed>
      <a class="wh-link" href="${url.loginResetCredentialsUrl}">Forgot password?</a>
    </#if>

    <#if realm.registrationAllowed && !registrationDisabled??>
      <a class="wh-link wh-link--register" href="${url.registrationUrl}">New to Stocdup? Create an account</a>
    </#if>

  </div>

</body>
</html>
