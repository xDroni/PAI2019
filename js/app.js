var app = angular.module("app", ['ngSanitize', 'ngRoute', 'ngAnimate', 'ngWebSocket', 'ui.bootstrap', 'nvd3']);

// zmienne globalne
app.value('globals', {
    email: ''
});

// nowe podstrony i ich kontrolery
app.constant('routes', [
	{ route: '/', templateUrl: '/html/home.html', controller: 'Home', controllerAs: 'ctrl', menu: '<i class="fa fa-lg fa-home"></i>', guest: true },
	{ route: '/transfer', templateUrl: '/html/transfer.html', controller: 'Transfer', controllerAs: 'ctrl', menu: 'Przelew' },
    { route: '/history', templateUrl: '/html/history.html', controller: 'History', controllerAs: 'ctrl', menu: 'Historia' },
    { route: '/trend', templateUrl: '/html/trend.html', controller: 'Trend', controllerAs: 'ctrl', menu: 'Trend' }    
]);

app.config(['$routeProvider', '$locationProvider', 'routes', function($routeProvider, $locationProvider, routes) {
    $locationProvider.hashPrefix('');
	for(var i in routes) {
		$routeProvider.when(routes[i].route, routes[i]);
	}
	$routeProvider.otherwise({ redirectTo: '/' });
}]);

app.controller("loginDialog", [ '$http', '$uibModalInstance', function($http, $uibModalInstance) {
    var ctrl = this;
    // devel: dla szybszego logowania
    ctrl.creds = { email: 'jim@beam.com', password: 'admin1' };
    ctrl.loginError = false;

    ctrl.tryLogin = function() {
        $http.post('/login', ctrl.creds).then(
            function(rep) {
                $uibModalInstance.close(rep.data.email);
            },
            function(err) {
                ctrl.loginError = true;
            }
        );
    };

    ctrl.cancel = function() {
        $uibModalInstance.dismiss('cancel');
    };

}]);

app.controller('Menu', ['$http', '$rootScope', '$scope', '$location', '$uibModal', '$websocket', 'routes', 'globals', 'common',
	function($http, $rootScope, $scope, $location, $uibModal, $websocket, routes, globals, common) {
        var ctrl = this;

        ctrl.alert = common.alert;
        ctrl.menu = [];

        var refreshMenu = function() {
            ctrl.menu = [];
            for (var i in routes) {
                if(routes[i].guest || globals.email) {
                    ctrl.menu.push({route: routes[i].route, title: routes[i].menu});
                }
            }
        };

        $http.get('/login').then(
            function(rep) { 
                globals.email = rep.data.email;
                refreshMenu();

                try {
                    var dataStream = $websocket('ws://' + window.location.host);
                    dataStream.onMessage(function(rep) {
                        try {
                            var message = JSON.parse(rep.data);
                            for(var topic in message) {
                                $rootScope.$broadcast(topic, message[topic]);
                            }
                        } catch(ex) {
                            console.error('Data from websocket cannot be parsed: ' + rep.data);
                        }
                    });
                    dataStream.send(JSON.stringify({action: 'init', session: rep.data.session}));
                } catch(ex) {
                    console.error('Initialization of websocket communication failed');
                }
            },
            function(err) { globals.email = null; }
        );

        ctrl.isCollapsed = true;

        $scope.$on('$routeChangeSuccess', function () {
            ctrl.isCollapsed = true;
        });

		ctrl.navClass = function(page) {
			return page === $location.path() ? 'active' : '';
		}

		ctrl.loginIcon = function() {
			return globals.email ? globals.email + '&nbsp;<span class="fa fa-lg fa-sign-out"></span>' : '<span class="fa fa-lg fa-sign-in"></span>';
		}

        ctrl.login = function() {
            if(globals.email) {
                common.confirm({ title: 'Koniec pracy?', body: 'Chcesz wylogować ' + globals.email + '?' }, function(answer) {
                    if(answer) {    
                        $http.delete('/login').then(
                            function(rep) {
                                globals.email = null;
                                refreshMenu();
                                $location.path('/');
                            },
                            function(err) {}
                        );
                    }
                });    
            } else {
                var modalInstance = $uibModal.open({
                    animation: true,
                    ariaLabelledBy: 'modal-title-top',
                    ariaDescribedBy: 'modal-body-top',
                    templateUrl: '/html/loginDialog.html',
                    controller: 'loginDialog',
                    controllerAs: 'ctrl'
                });
                modalInstance.result.then(
                    function(data) {
                        globals.email = data;
                        refreshMenu();
                        $location.path('/');
                    });
            }};

        ctrl.closeAlert = function() { ctrl.alert.text = ""; };
}]);

/*
    common.confirm( { title: title, body: body, noOk: false, noCancel: false } , function(answer) { ... } )
    common.showMessage( message )
    common.showError( message )
*/
app.service('common', [ '$uibModal', 'globals', function($uibModal, globals) {

    this.confirm = function(confirmOptions, callback) {

        var modalInstance = $uibModal.open({
            animation: true,
            ariaLabelledBy: 'modal-title-top',
            ariaDescribedBy: 'modal-body-top',
            templateUrl: '/html/confirm.html',
            controller: 'Confirm',
            controllerAs: 'ctrl',
            resolve: {
                confirmOptions: function () {
                    return confirmOptions;
                }
            }
        });

        modalInstance.result.then(
            function () { callback(true); },
            function (ret) { callback(false); }
        );
    };

    this.alert = { text: '', type: '' };
    
    this.showMessage = function(msg) {
        this.alert.type = 'alert-success';
        this.alert.text = msg;
    };

    this.showError = function(msg) {
        this.alert.type = 'alert-danger';
        this.alert.text = msg;
    };

    this.stamp2date = function(stamp) {
        return new Date(stamp).toLocaleString();
    };
    
}]);