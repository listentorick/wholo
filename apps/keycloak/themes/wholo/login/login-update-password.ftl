<!DOCTYPE html>
<html lang="${(locale.currentLanguageTag)!'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>New Password — Stocdup</title>
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
      <p class="wh-subtitle">New Password</p>
      <div class="wh-divider"></div>
    </div>

    <#if message?has_content>
      <p class="wh-error">${kcSanitize(message.summary)}</p>
    </#if>

    <form id="kc-passwd-update-form" action="${url.loginAction}" method="post">

      <input type="hidden" id="username" name="username" value="${(auth.attemptedUsername)!''}" autocomplete="username" />

      <div class="wh-field">
        <label for="password-new">New Password</label>
        <input
          type="password"
          id="password-new"
          name="password-new"
          autocomplete="new-password"
          placeholder="••••••••"
          autofocus
        />
      </div>

      <div class="wh-field wh-field--last">
        <label for="password-confirm">Confirm Password</label>
        <input
          type="password"
          id="password-confirm"
          name="password-confirm"
          autocomplete="new-password"
          placeholder="••••••••"
        />
      </div>

      <button class="wh-btn" type="submit">
        Update Password
      </button>

    </form>

  </div>

</body>
</html>
