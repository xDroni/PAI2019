app.controller("Transfer", [ '$http', '$scope', '$uibModal', 'common', function($http, $scope, $uibModal, common) {
    var ctrl = this;
    
    ctrl.account = {};
    ctrl.emails = [];

    var initVars = function() {
        ctrl.transaction = { recipient: "", amount: "", description: "" };
    };

    initVars();

    var refreshAccount = function() {
        $http.get('/account').then(function (rep) {
            ctrl.account = rep.data;
        }, function(err) {});
    };

    refreshAccount();

    $http.get('/recipients').then(function(rep) {
        ctrl.emails = rep.data;
    }, function(err) {});

    ctrl.doTransfer = function() {
        $http.post('/account', ctrl.transaction).then(
            function (rep) {
                ctrl.account = rep.data;
                common.showMessage('Przelew udany');
                initVars();
            },
            function (err) {
                common.showError('Przelew nieudany, czy odbiorca jest poprawny?');
            }
        );
    };

    ctrl.formInvalid = function() {
        return ctrl.transaction.amount <= 0 || ctrl.account.balance - ctrl.transaction.amount < ctrl.account.limit;
    };

    $scope.$on('transfer', function(event, obj) {
        refreshAccount();
    });

    ctrl.openModal = function() {
        var modalInstance = $uibModal.open({
            animation: true,
            ariaLabelledBy: 'modal-title-top',
            ariaDescribedBy: 'modal-body-top',
            templateUrl: '/html/transferDialog.html',
            controller: 'TransferDialog',
            controllerAs: 'ctrl',
            resolve: {
                emails: function() { return ctrl.emails; }
            }
        });
        modalInstance.result.then(
            function(data) {
                ctrl.transaction.recipient = data.recipient;
                ctrl.transaction.amount = data.amount;
                ctrl.transaction.description = data.description;
            });
    };

}]);

app.controller("TransferDialog", [ '$uibModalInstance', 'emails', function($uibModalInstance, emails) {
    console.log("TransferDialog start");
    var ctrl = this;
    ctrl.emails = emails;
    ctrl.transaction = { recipient: '', amount: 0, description: '' };

    ctrl.submit = function(submit) {
        if(submit)
            $uibModalInstance.close(ctrl.transaction);
        else
            $uibModalInstance.dismiss('cancel');
    }
}]);