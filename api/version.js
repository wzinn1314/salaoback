export default function handler(request,response){
  response.setHeader('Cache-Control','no-store');
  response.status(200).json({
    version:'firebase-rtdb-v2',
    storage:'firebase-realtime-database',
    credentialsConfigured:Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
    adminConfigured:Boolean(process.env.ADMIN_PASSWORD_HASH||process.env.ADMIN_PASSWORD)
  });
}
