<!DOCTYPE html>
<html lang="${(locale.currentLanguageTag)!'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Stocdup</title>
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
      <#if messageHeader??>
        <p class="wh-subtitle">${kcSanitize(msg(messageHeader))?no_esc}</p>
      <#else>
        <p class="wh-subtitle">Account</p>
      </#if>
      <div class="wh-divider"></div>
    </div>

    <#if message?has_content>
      <p class="wh-body">${kcSanitize(message.summary)?no_esc}<#if requiredActions??><#list requiredActions><b><#items as reqActionItem>${kcSanitize(msg("requiredAction.${reqActionItem}"))?no_esc}<#sep>, </#items></b></#list></#if></p>
    </#if>

    <#if skipLink??>
    <#else>
      <#if pageRedirectUri?has_content>
        <a class="wh-btn wh-btn--link" href="${pageRedirectUri}">Continue</a>
      <#elseif actionUri?has_content>
        <a class="wh-btn wh-btn--link" href="${actionUri}">Continue</a>
      <#elseif (client.baseUrl)?has_content>
        <a class="wh-btn wh-btn--link" href="${client.baseUrl}">Continue</a>
      </#if>
    </#if>

  </div>

</body>
</html>
