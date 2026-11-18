using './main.bicep'

param env = 'prod'
param alertEmail = readEnvironmentVariable('ALERT_EMAIL')
param appVersion = readEnvironmentVariable('APP_VERSION', 'manual')
