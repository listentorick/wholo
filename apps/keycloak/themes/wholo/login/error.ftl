<!DOCTYPE html>
<html lang="${(locale.currentLanguageTag)!'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Something went wrong — Stocdup</title>
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
      <p class="wh-subtitle">Something went wrong</p>
      <div class="wh-divider"></div>
    </div>

    <#if message?has_content>
      <p class="wh-body">${kcSanitize(message.summary)?no_esc}</p>
    </#if>

    <#if skipLink??>
    <#else>
      <#if client?? && (client.baseUrl)?has_content>
        <a class="wh-btn wh-btn--link" href="${client.baseUrl}">Back to Stocdup</a>
      </#if>
    </#if>

  </div>

</body>
</html>
