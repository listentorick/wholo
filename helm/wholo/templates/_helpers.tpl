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
{{- printf "postgresql://%s:%s@%s:%d/%s" .Values.postgresql.username .Values.postgresql.password (include "wholo.postgresql.host" .) (int .Values.postgresql.port) .Values.postgresql.database }}
{{- end }}

{{- define "wholo.adminApi.host" -}}
{{- printf "%s-admin-api" (include "wholo.fullname" .) }}
{{- end }}
