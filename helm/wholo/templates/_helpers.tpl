{{/*
Expand the name of the chart.
*/}}
{{- define "wholo.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "wholo.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s" .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{- define "wholo.postgresql.host" -}}
{{- printf "%s-postgresql" (include "wholo.fullname" .) }}
{{- end }}

{{- define "wholo.redis.host" -}}
{{- printf "%s-redis" (include "wholo.fullname" .) }}
{{- end }}

{{- define "wholo.postgresql.url" -}}
{{- printf "postgresql://%s:%s@%s:%d/%s?connection_limit=10" .Values.postgresql.username .Values.postgresql.password (include "wholo.postgresql.host" .) (int .Values.postgresql.port) .Values.postgresql.database }}
{{- end }}

{{- define "wholo.adminApi.host" -}}
{{- printf "%s-admin-api" (include "wholo.fullname" .) }}
{{- end }}

{{- define "wholo.keycloak.host" -}}
{{- printf "%s-keycloak" (include "wholo.fullname" .) }}
{{- end }}

{{- define "wholo.telegraf.host" -}}
{{- printf "%s-telegraf" (include "wholo.fullname" .) }}
{{- end }}

{{- define "wholo.influxdb.host" -}}
{{- printf "%s-influxdb" (include "wholo.fullname" .) }}
{{- end }}

{{- define "wholo.loki.host" -}}
{{- printf "%s-loki" (include "wholo.fullname" .) }}
{{- end }}

{{/*
Loki host Fluent Bit pushes logs to (ADR-064): the explicit fluentBit.loki.host
when set (live = the external ops-host Loki), otherwise the in-cluster Loki
service (local dev). Mirrors wholo.telegraf.influxUrl.
*/}}
{{- define "wholo.loki.pushHost" -}}
{{- .Values.fluentBit.loki.host | default (include "wholo.loki.host" .) -}}
{{- end }}

{{/*
InfluxDB URL Telegraf writes to: the explicit telegraf.influx.url when set
(live points this at the external ops-host InfluxDB), otherwise the in-cluster
InfluxDB service (local dev).
*/}}
{{- define "wholo.telegraf.influxUrl" -}}
{{- if .Values.telegraf.influx.url -}}
{{- .Values.telegraf.influx.url -}}
{{- else -}}
{{- printf "http://%s:8086" (include "wholo.influxdb.host" .) -}}
{{- end -}}
{{- end }}

{{/*
InfluxDB token Telegraf authenticates with: the explicit telegraf.influx.token
when set (live), otherwise the in-cluster InfluxDB admin token (local dev).
*/}}
{{- define "wholo.telegraf.influxToken" -}}
{{- .Values.telegraf.influx.token | default .Values.influxdb.adminToken -}}
{{- end }}

{{/*
Pod-spec-level imagePullSecrets block, pre-indented for the standard
Deployment/Job pod spec depth. Renders nothing when the list is empty.
*/}}
{{- define "wholo.imagePullSecrets" -}}
{{- with .Values.imagePullSecrets }}
{{ "imagePullSecrets:" | indent 6 }}
{{- toYaml . | nindent 8 }}
{{- end }}
{{- end }}
