<!DOCTYPE html>
<html lang="${(locale.currentLanguageTag)!'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Check Your Email — Stocdup</title>
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
      <p class="wh-subtitle">Check Your Email</p>
      <div class="wh-divider"></div>
    </div>

    <p class="wh-body">
      We&#39;ve sent a verification link to
      <#if user?? && user.email?has_content><strong>${user.email}</strong><#else>your email address</#if>.
      Open it to confirm your account and continue.
    </p>

    <p class="wh-body wh-body--muted">
      Not arrived? Check your spam folder, or
      <a class="wh-inline-link" href="${url.loginAction}">send it again</a>.
    </p>

  </div>

</body>
</html>
