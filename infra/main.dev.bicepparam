using './main.bicep'

param env = 'dev'
param alertEmail = readEnvironmentVariable('ALERT_EMAIL')
param appVersion = readEnvironmentVariable('APP_VERSION', 'manual')
