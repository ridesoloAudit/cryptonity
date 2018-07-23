pragma solidity ^0.4.23;

import "openzeppelin-solidity/contracts/crowdsale/validation/WhitelistedCrowdsale.sol";
import "openzeppelin-solidity/contracts/crowdsale/validation/TimedCrowdsale.sol";
import "openzeppelin-solidity/contracts/crowdsale/distribution/RefundableCrowdsale.sol";
import "openzeppelin-solidity/contracts/crowdsale/distribution/PostDeliveryCrowdsale.sol";
import "openzeppelin-solidity/contracts/lifecycle/Pausable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "../token/CryptonityToken.sol";
import "./FiatContractInterface.sol";
import "./BurnableTokenInterface.sol";

/**
 * @title CryptonityCrowdsale
 * @dev CryptonityCrowdsale
 */
// solium-disable-next-line max-len
contract CryptonityCrowdsale is TimedCrowdsale, WhitelistedCrowdsale, RefundableCrowdsale, PostDeliveryCrowdsale, Pausable {
  using SafeMath for uint256;

  // public supply of token
  uint256 public publicSupply = 60000000 * 1 ether;
  // remaining public supply of token for each phase
  uint256[3] public remainingPublicSupplyPerPhase = [15000000 * 1 ether, 26000000 * 1 ether, 19000000 * 1 ether];

  uint256[3] public phasesStartTime;
  uint256[3] public phasesTokenPrices = [23, 34, 58]; // price in $ cents
  uint256[3] public phasesBonuses = [50, 30, 15]; // bonuses in percentage

  uint256 deliveryTime;

  // Fiat Contract
  FiatContractInterface public price;
  // 0,01$ to wei
  uint256 public ethCent;
  // Amount of USD raised
  uint256 public USDRaised;
  // A limit for total contributions
  uint256 public cap;

  /**
   * @param _openingTime Crowdsale opening time
   * @param _closingTime Crowdsale closing time
   * @param _secondPhaseStartTime Crowdsale second phase start time
   * @param _thirdPhaseStartTime Crowdsale third phase start time
   * @param _rate Number of token units a buyer gets per wei
   * @param _wallet Address where collected funds will be forwarded to
   * @param _token Address of the token being sold
   * @param _softCapInUSD Funding goal
   * @param _hardCapInUSD Max amount of wei to be contributed
   */
  constructor(
    uint256 _openingTime,
    uint256 _closingTime,
    uint256 _secondPhaseStartTime,
    uint256 _thirdPhaseStartTime,
    uint256 _rate,
    address _wallet,
    ERC20 _token,
    uint256 _softCapInUSD,
    uint256 _hardCapInUSD,
    address _fiatContract
  )
    public
    Crowdsale(_rate, _wallet, _token)
    TimedCrowdsale(_openingTime, _closingTime)
    RefundableCrowdsale(_softCapInUSD)
  {
    require(_hardCapInUSD > 0);
    require(_softCapInUSD <= _hardCapInUSD);
    require(_secondPhaseStartTime >= _openingTime);
    require(_thirdPhaseStartTime >= _secondPhaseStartTime);
    require(_closingTime >= _thirdPhaseStartTime);
    cap = _hardCapInUSD;
    // fiat contract for converting USD => ETH
    price = FiatContractInterface(_fiatContract);
    // token delivery starts 15 days after the crowdsale ends
    deliveryTime = _closingTime.add(15 days);
    phasesStartTime = [_openingTime, _secondPhaseStartTime, _thirdPhaseStartTime];
  }

  /**
  * @dev Set fiat contract
  */
  function setFiatContract(address _newFiatContract) public onlyOwner {
    price = FiatContractInterface(_newFiatContract);
  }

 /**
  * @dev Get phase number depending on the current time
  */
  function getPhaseNumber() internal view onlyWhileOpen returns (uint256) {
    if (now < phasesStartTime[1]) {
      return 0;
    } else if (now < phasesStartTime[2]) {
      return 1;
    } else {
      return 2;
    }
  }

  /**
  * @dev Returns the current token price in $ cents depending on the current time
  */
  function getCurrentTokenPriceInCents() public view returns (uint256) {
    return phasesTokenPrices[getPhaseNumber()];
  }

  /**
  * @dev Returns the token sale bonus percentage depending on the current time
  */
  function getCurrentBonusPercentage() public view returns (uint256) {
    return phasesBonuses[getPhaseNumber()];
  }

  /**
  * @dev Returns the current rate depending on the current time
  */
  function _calculateCurrentRate() internal view returns (uint256) {
    // returns $0.01 ETH wei
    ethCent = price.USD(0);
    return getCurrentTokenPriceInCents().mul(1 ether).div(ethCent);
  }

  /**
  * @dev Set the current rate
  * @param _newRate New rate
  */
  function _setCurrentRate(uint256 _newRate) internal {
    rate = _newRate;
  }

  /**
   * @dev Checks whether the cap has been reached.
   * @return Whether the cap was reached
   */
  function capReached() public view returns (bool) {
    return USDRaised >= cap;
  }


  /**
   * @dev Checks whether funding goal was reached.
   * @return Whether funding goal was reached
   */
  function goalReached() public view returns (bool) {
    return USDRaised >= goal;
  }

  /**
   * @dev Validation of an incoming purchase. Allowas purchases only when crowdsale is not paused.
   * @param _beneficiary Address performing the token purchase
   * @param _weiAmount Value in wei involved in the purchase
   */
  function _preValidatePurchase(address _beneficiary, uint256 _weiAmount) internal whenNotPaused {
    super._preValidatePurchase(_beneficiary, _weiAmount);
    // update current rate according to the USD/ETH rate
    _setCurrentRate(_calculateCurrentRate());
    require(USDRaised.add(_weiAmount.div(ethCent)) <= cap);
  }

  /**
   * @dev Executed when a purchase has been validated and is ready to be executed. Not necessarily emits/sends tokens.
   * It computes the bonus.
   * @param _beneficiary Address receiving the tokens
   * @param _tokenAmount Number of tokens to be purchased
   */
  function _processPurchase(address _beneficiary, uint256 _tokenAmount) internal {
    uint256 totalAmount = _tokenAmount;
    uint256 bonusPercent = getCurrentBonusPercentage();

    if (bonusPercent > 0) {
      uint256 bonusAmount = totalAmount.mul(bonusPercent).div(100); // tokens * bonus (%) / 100%
      totalAmount = totalAmount.add(bonusAmount);
    }
    uint256 phaseNumber = getPhaseNumber();
    require(remainingPublicSupplyPerPhase[phaseNumber] > totalAmount);
    super._processPurchase(_beneficiary, totalAmount);
    remainingPublicSupplyPerPhase[phaseNumber] = remainingPublicSupplyPerPhase[phaseNumber].sub(totalAmount);
  }

  /**
   * @dev Update internal state to check for validity.
   * Update USD raised
   * @param _beneficiary Address receiving the tokens
   * @param _weiAmount Value in wei involved in the purchase
   */
  function _updatePurchasingState(
    address _beneficiary,
    uint256 _weiAmount
  )
    internal
  {
    // update USD raised
    USDRaised = USDRaised.add(_weiAmount.div(ethCent));
  }

  /**
  * @dev Withdraw tokens only after the deliveryTime
  */
  function withdrawTokens() public {
    require(goalReached());
    // solium-disable-next-line security/no-block-members
    require(now > deliveryTime);
    super.withdrawTokens();
  }

  /**
   * @dev Finalization logic.
   * Burn the remaining tokens.
   */
  function finalization() internal {
    super.finalization();
    uint totalRemainingPublicSupply = 0;
    for (uint i = 0; i < remainingPublicSupplyPerPhase.length; i++) {
      totalRemainingPublicSupply = totalRemainingPublicSupply.add(remainingPublicSupplyPerPhase[i]);
    }
    if (totalRemainingPublicSupply > 0) {
      BurnableTokenInterface(address(token)).burn(totalRemainingPublicSupply);
      delete remainingPublicSupplyPerPhase;
    }
    Ownable(address(token)).transferOwnership(owner);
  }

}