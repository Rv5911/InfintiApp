const firebaseConfig = {
  apiKey: "AIzaSyDK5uF-816i4_R9UlT0v5_BD12qu3rpF8E",
  authDomain: "smarttvapp-5f8ca.firebaseapp.com",
  projectId: "smarttvapp-5f8ca",
  storageBucket: "smarttvapp-5f8ca.firebasestorage.app",
  messagingSenderId: "430801978001",
  appId: "1:430801978001:web:74d60528a2d1c37dfdb530",
  measurementId: "G-3G73FDKF4B"
};

firebase.initializeApp(firebaseConfig);
firebase.analytics();

var db = firebase.firestore();

window.logAllDnsEntries = function () {
  db.collection("DNS").get()
    .then(function (snapshot) {
      snapshot.forEach(function (doc) {
        console.log("DNS Entry:", doc.id, "=>", doc.data());
        localStorage.setItem("all_dns", JSON.stringify(doc.data().DNS));
      });

    })
    .catch(function (error) {
      alert("Error getting DNS entries: " + error.message);
    });
};

window.getTmbdId = function () {
  db.collection("TMDBID").get()
    .then(function (snapshot) {
      snapshot.forEach(function (doc) {
        const tmbdId=doc.data().tmbd_api_key? doc.data().tmbd_api_key : ""
        console.log("TMDBID Entry:", doc.id, "=>", tmbdId);
        localStorage.setItem("tmbdId", tmbdId);
      });

    })
    .catch(function (error) {
      alert("Error getting TMDBID entries: " + error.message);
    });
};
