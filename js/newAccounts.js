app.controller("NewAccounts", [ '$http', '$scope', 'globals', 'common', function($http, $scope, globals, common) {
  var ctrl = this;
  ctrl.email = globals.email;

  var initVars = function() {
    ctrl.newAccountsCount = 0;
    ctrl.limit = 20;
    ctrl.filter = 'Wszystkie';
  };

  initVars();

  ctrl.createAccount = function(entry) {
    $http.post('/newAccounts', {entry, action: 'accept'}).then(() =>  {
      ctrl.refreshAccounts();
      common.showMessage('Konto utworzone');
    });
  };

  ctrl.rejectAccount = function(entry) {
    $http.post('/newAccounts', {entry, action: 'reject'}).then(() => {
      ctrl.refreshAccounts();
      common.showMessage('Konto odrzucone');
    });
  };

  ctrl.refreshAccounts = function() {
    $http.delete('/newAccounts').then(
        function(rep) { ctrl.newAccountsCount = rep.data.length; },
        function(err) {}
    );
    var limit = ctrl.limit;
    if(limit <= 0) limit = 1;
    $http.get('/newAccounts?skip=0&limit=' + limit + '&filter=' + ctrl.filter).then(
        function(rep) { ctrl.newAccounts = rep.data; },
        function(err) {}
    );
  };

  ctrl.stamp2date = common.stamp2date;

  ctrl.refreshAccounts();

  $scope.options = ["Wszystkie", "Przyjęte", "Odrzucone", "Oczekujące"];
}]);